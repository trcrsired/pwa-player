// ===============================
// Embedded Player Support
// ===============================
// This file orchestrates the embedded player UI and delegates to platform implementations
// Platform implementations are in the platforms/ directory

const embeddedPlayer = document.getElementById("embeddedPlayer");
const videoPlayer = document.getElementById("player");

// Current active platform instance
let currentPlatformInstance = null;

// Current playlist metadata for embedded player
let currentEmbeddedPlaylist = null;
let currentEmbeddedTitle = null;

// Auto-hide timers
let showBtnAutoHideTimer = null;
let controlsAutoHideTimer = null;

// Play from embedded URL using the platform registry
function playEmbeddedUrl(url, metadata = {}) {
    const platformClass = getPlatformForUrl(url);
    if (!platformClass) {
        return false;
    }

    const videoId = platformClass.extractVideoId(url);
    if (!videoId) {
        return false;
    }

    // Save playlist metadata
    currentEmbeddedPlaylist = metadata.playlist;
    currentEmbeddedTitle = metadata.title;

    // Destroy previous platform instance if any
    if (currentPlatformInstance) {
        currentPlatformInstance.destroyPlayer();
    }

    // Clear A-B loop when starting embedded player
    if (typeof clearABLoop === 'function') {
        clearABLoop();
    }

    // Clear cached embedded player values
    window._cachedEmbeddedCurrentTime = 0;
    window._cachedEmbeddedDuration = 0;

    // Pause the normal video player and clear its source before switching to embedded
    if (typeof clearVideoSource === 'function') {
        clearVideoSource();
    } else {
        // Fallback if function not available
        const videoEl = document.getElementById("player");
        if (videoEl) {
            videoEl.pause();
            videoEl.currentTime = 0;
            videoEl.removeAttribute("src");
            videoEl.load();
        }
    }

    // Clear the embedded player container
    embeddedPlayer.innerHTML = '';

    // Show embedded player, hide video player
    videoPlayer.classList.add('hidden');
    embeddedPlayer.classList.remove('hidden');

    // Create new platform instance
    currentPlatformInstance = new platformClass();

    // Store playlist info for playback continuation
    if (metadata.playlist) {
        const { playlistName, entryPath, index } = metadata.playlist;
        if (playlistName && entryPath) {
            kv_set("lastplaylist", { playlistName, index: index || 0 });
        }
    }

    // Create the player
    currentPlatformInstance.createPlayer(videoId, 'embeddedPlayer', {
        onReady: () => {
            // Hide our controls panel - embedded player has its own controls
            const controls = document.getElementById("controls");
            if (controls) controls.classList.add("hidden");

            // Show the trigger zone - user can hover to reveal controls button
            const triggerZone = document.getElementById("embeddedShowBtnTriggerZone");
            const showBtn = document.getElementById("embeddedShowControlsBtn");
            if (triggerZone) triggerZone.classList.remove("hidden");
            if (showBtn) showBtn.classList.add("hidden");
        }
    });

    return true;
}

// Handle embedded video ended - transition to next item in playlist
function handleEmbeddedVideoEnded() {
    // Call playNext from nowplaying.js
    if (typeof playNext === 'function') {
        playNext();
    }
}

// Update playlist entry name with fetched title
async function updatePlaylistEntryName(playlistName, entryPath, newName) {
    if (!playlistName || !entryPath || !newName) return;

    try {
        const playlists = await playlists_load();
        if (!playlists[playlistName]) return;

        const entry = playlists[playlistName].find(item => item.path === entryPath);
        if (entry && entry.name !== newName) {
            entry.name = newName;
            await playlists_save(playlists);
            // Re-render playlist tree if visible
            if (typeof playlist_renderTree === 'function') {
                playlist_renderTree();
            }
            // Also update now playing queue display
            if (typeof renderNowPlayingQueue === 'function') {
                renderNowPlayingQueue();
            }
        }
    } catch (e) {
        console.warn('Failed to update playlist entry name:', e);
    }
}

// Stop embedded player and switch back to video player
function stopEmbeddedPlayer() {
    if (currentPlatformInstance) {
        currentPlatformInstance.destroyPlayer();
        currentPlatformInstance = null;
    }

    // Hide the trigger zone and floating button, clear timers
    const triggerZone = document.getElementById("embeddedShowBtnTriggerZone");
    const showBtn = document.getElementById("embeddedShowControlsBtn");
    if (triggerZone) triggerZone.classList.add("hidden");
    if (showBtn) showBtn.classList.add("hidden");

    if (showBtnAutoHideTimer) {
        clearTimeout(showBtnAutoHideTimer);
        showBtnAutoHideTimer = null;
    }

    if (controlsAutoHideTimer) {
        clearTimeout(controlsAutoHideTimer);
        controlsAutoHideTimer = null;
    }

    // Clear cached embedded player values
    window._cachedEmbeddedCurrentTime = 0;
    window._cachedEmbeddedDuration = 0;

    embeddedPlayer.innerHTML = '';
    embeddedPlayer.classList.add('hidden');
    videoPlayer.classList.remove('hidden');

    // Show our controls panel
    const controls = document.getElementById("controls");
    if (controls) controls.classList.remove("hidden");

    document.title = 'PWA Player';
    navigator.mediaSession.metadata = new MediaMetadata({});
    navigator.mediaSession.playbackState = 'paused';

    const playBtn = document.getElementById("playBtn");
    const npPlayBtn = document.getElementById("npPlayBtn");
    if (playBtn) playBtn.textContent = "▶️";
    if (npPlayBtn) npPlayBtn.textContent = "▶️";

    const progressBar = document.getElementById("progressBar");
    const npProgressBar = document.getElementById("npProgressBar");
    const timeDisplay = document.getElementById("timeDisplay");
    const npTimeDisplay = document.getElementById("npTimeDisplay");
    if (progressBar) progressBar.value = 0;
    if (npProgressBar) npProgressBar.value = 0;
    if (timeDisplay) timeDisplay.textContent = '0:00 / 0:00';
    if (npTimeDisplay) npTimeDisplay.textContent = '0:00 / 0:00';

    // Clear Now Playing info
    const titleEl = document.querySelector("#nowPlayingInfo .track-title");
    const artistEl = document.querySelector("#nowPlayingInfo .track-artist");
    const urlEl = document.querySelector("#nowPlayingInfo .track-url");
    if (titleEl) titleEl.textContent = "No track playing";
    if (artistEl) artistEl.textContent = "";
    if (urlEl) urlEl.textContent = "";

    // Clear A-B loop
    if (typeof clearABLoop === 'function') clearABLoop();
}

// Check if embedded player is active
function isEmbeddedPlayerActive() {
    return !embeddedPlayer.classList.contains('hidden');
}

// Get embedded player duration in seconds
function getEmbeddedDuration() {
    if (currentPlatformInstance && typeof currentPlatformInstance.getDuration === 'function') {
        return currentPlatformInstance.getDuration();
    }
    return 0;
}

// Get embedded player current time in seconds
function getEmbeddedCurrentTime() {
    if (currentPlatformInstance && typeof currentPlatformInstance.getCurrentTime === 'function') {
        return currentPlatformInstance.getCurrentTime();
    }
    return 0;
}

// Seek embedded player to specific time in seconds
function seekEmbeddedPlayerToTime(seconds) {
    if (currentPlatformInstance && typeof currentPlatformInstance.seekToTime === 'function') {
        currentPlatformInstance.seekToTime(seconds);
    }
}

// Toggle play/pause for embedded player
function toggleEmbeddedPlayerPlayPause() {
    if (currentPlatformInstance) {
        currentPlatformInstance.togglePlayPause();
    }
}

// Play embedded player
function playEmbeddedPlayer() {
    if (currentPlatformInstance && typeof currentPlatformInstance.play === 'function') {
        currentPlatformInstance.play();
    }
}

// Pause embedded player
function pauseEmbeddedPlayer() {
    if (currentPlatformInstance && typeof currentPlatformInstance.pause === 'function') {
        currentPlatformInstance.pause();
    }
}

// Seek embedded video to percent
function seekEmbeddedPlayer(percent) {
    if (currentPlatformInstance) {
        currentPlatformInstance.seekToPercent(percent);
    }
}

// Seek YouTube video (legacy function name)
function seekYtPlayer(percent) {
    seekEmbeddedPlayer(percent);
}

// Set embedded player volume
function setEmbeddedVolume(percent) {
    if (currentPlatformInstance) {
        currentPlatformInstance.setVolume(percent);
    }
}

// Set YouTube volume (legacy function name)
function setYtVolume(percent) {
    setEmbeddedVolume(percent);
}

// Get auto-hide delay from settings (default 10 seconds)
function getControlsAutoHideDelay() {
    const delay = parseInt(localStorage.getItem("controlsAutoHideDelay"), 10);
    return delay > 0 ? delay : 10000;
}

// Start auto-hide timer for the floating show button (3 seconds)
function startShowBtnAutoHide() {
    if (showBtnAutoHideTimer) {
        clearTimeout(showBtnAutoHideTimer);
    }

    showBtnAutoHideTimer = setTimeout(() => {
        if (isEmbeddedPlayerActive()) {
            const showBtn = document.getElementById("embeddedShowControlsBtn");
            if (showBtn) showBtn.classList.add("hidden");
        }
    }, 3000);
}

// Start auto-hide timer for controls
function startControlsAutoHide() {
    if (controlsAutoHideTimer) {
        clearTimeout(controlsAutoHideTimer);
    }

    controlsAutoHideTimer = setTimeout(() => {
        if (isEmbeddedPlayerActive()) {
            const controls = document.getElementById("controls");
            const triggerZone = document.getElementById("embeddedShowBtnTriggerZone");
            if (controls) controls.classList.add("hidden");
            if (triggerZone) triggerZone.classList.remove("hidden");
        }
    }, getControlsAutoHideDelay());
}

// Show controls and start auto-hide timer
function showEmbeddedControls() {
    const controls = document.getElementById("controls");
    const triggerZone = document.getElementById("embeddedShowBtnTriggerZone");
    const showBtn = document.getElementById("embeddedShowControlsBtn");

    if (!controls || !isEmbeddedPlayerActive()) return;

    controls.classList.remove("hidden");
    if (triggerZone) triggerZone.classList.add("hidden");
    if (showBtn) showBtn.classList.add("hidden");

    startControlsAutoHide();
}

// Hook into stop button to also stop embedded player
const _originalToggleStopBtn = window.toggleStopBtn;
window.toggleStopBtn = async function() {
    if (isEmbeddedPlayerActive()) {
        stopEmbeddedPlayer();
        return;
    }
    if (_originalToggleStopBtn) {
        await _originalToggleStopBtn();
    }
};

// Hook into play button to toggle embedded player
document.getElementById("playBtn")?.addEventListener("click", () => {
    if (isEmbeddedPlayerActive()) {
        toggleEmbeddedPlayerPlayPause();
    }
});

document.getElementById("npPlayBtn")?.addEventListener("click", () => {
    if (isEmbeddedPlayerActive()) {
        toggleEmbeddedPlayerPlayPause();
    }
});

// Hook into progress bar for seeking
document.getElementById("progressBar")?.addEventListener("input", (e) => {
    if (isEmbeddedPlayerActive()) {
        seekEmbeddedPlayer(parseFloat(e.target.value));
    }
});

document.getElementById("npProgressBar")?.addEventListener("input", (e) => {
    if (isEmbeddedPlayerActive()) {
        seekEmbeddedPlayer(parseFloat(e.target.value));
    }
});

// Hook into volume slider
document.getElementById("volumeSlider")?.addEventListener("input", (e) => {
    if (isEmbeddedPlayerActive()) {
        setEmbeddedVolume(parseInt(e.target.value, 10));
    }
});

document.getElementById("npVolumeSlider")?.addEventListener("input", (e) => {
    if (isEmbeddedPlayerActive()) {
        setEmbeddedVolume(parseInt(e.target.value, 10));
    }
});

// MediaSession handlers for embedded player
if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => {
        if (isEmbeddedPlayerActive() && currentPlatformInstance) {
            currentPlatformInstance.play();
        }
    });

    navigator.mediaSession.setActionHandler('pause', () => {
        if (isEmbeddedPlayerActive() && currentPlatformInstance) {
            currentPlatformInstance.pause();
        }
    });

    navigator.mediaSession.setActionHandler('stop', () => {
        if (isEmbeddedPlayerActive()) {
            stopEmbeddedPlayer();
        }
    });

    navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (isEmbeddedPlayerActive() && currentPlatformInstance && details.seekTime) {
            currentPlatformInstance.seekToTime(details.seekTime);
        }
    });
}

// Trigger zone mouseenter shows the floating button
const triggerZone = document.getElementById("embeddedShowBtnTriggerZone");
if (triggerZone) {
    triggerZone.addEventListener("mouseenter", () => {
        if (!isEmbeddedPlayerActive()) return;

        const showBtn = document.getElementById("embeddedShowControlsBtn");
        if (showBtn) {
            showBtn.classList.remove("hidden");
            startShowBtnAutoHide();
        }
    });

    // Touch on trigger zone also shows the button (for mobile)
    triggerZone.addEventListener("touchstart", (e) => {
        if (!isEmbeddedPlayerActive()) return;

        // Prevent the touch from passing through to iframe
        e.preventDefault();

        const showBtn = document.getElementById("embeddedShowControlsBtn");
        if (showBtn) {
            showBtn.classList.remove("hidden");
            startShowBtnAutoHide();
        }
    }, { passive: false });
}

// Floating button click handler
const showBtn = document.getElementById("embeddedShowControlsBtn");
if (showBtn) {
    showBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showEmbeddedControls();
    });
}

// Click outside controls to hide them and show trigger zone again
document.addEventListener("click", (e) => {
    if (!isEmbeddedPlayerActive()) return;

    const controls = document.getElementById("controls");
    const showBtn = document.getElementById("embeddedShowControlsBtn");
    const triggerZone = document.getElementById("embeddedShowBtnTriggerZone");
    const embeddedPlayerEl = document.getElementById("embeddedPlayer");

    if (!controls) return;

    if (!controls.classList.contains("hidden")) {
        const target = e.target;
        if (!controls.contains(target) && target !== showBtn && !embeddedPlayerEl?.contains(target)) {
            controls.classList.add("hidden");
            if (triggerZone) triggerZone.classList.remove("hidden");
            if (showBtn) showBtn.classList.add("hidden");
        }
    }
});

// Detect fullscreen changes
function handleFullscreenChange(isFullscreen) {
    if (!isEmbeddedPlayerActive()) return;

    const controls = document.getElementById("controls");
    const triggerZone = document.getElementById("embeddedShowBtnTriggerZone");
    const showBtn = document.getElementById("embeddedShowControlsBtn");

    if (isFullscreen) {
        if (controls) controls.classList.add("hidden");
        if (triggerZone) triggerZone.classList.add("hidden");
        if (showBtn) showBtn.classList.add("hidden");

        if (showBtnAutoHideTimer) {
            clearTimeout(showBtnAutoHideTimer);
            showBtnAutoHideTimer = null;
        }
        if (controlsAutoHideTimer) {
            clearTimeout(controlsAutoHideTimer);
            controlsAutoHideTimer = null;
        }
    }
}

document.addEventListener("fullscreenchange", () => {
    handleFullscreenChange(document.fullscreenElement !== null);
});

document.addEventListener("webkitfullscreenchange", () => {
    handleFullscreenChange(document.webkitFullscreenElement !== null);
});