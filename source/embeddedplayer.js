// ===============================
// Embedded Player Support (YouTube, etc.)
// ===============================

const embeddedPlayer = document.getElementById("embeddedPlayer");
const videoPlayer = document.getElementById("player");

// YouTube API ready flag
let ytApiReady = false;
let ytApiLoading = false;
let ytPlayer = null;
let ytProgressInterval = null;

// Extract YouTube video ID from URL
function extractYouTubeVideoId(url) {
    if (!url) return null;

    // Handle various YouTube URL formats
    // youtube.com/watch?v=VIDEO_ID
    // m.youtube.com/watch?v=VIDEO_ID
    // youtube.com/embed/VIDEO_ID
    // youtube.com/v/VIDEO_ID
    // youtu.be/VIDEO_ID

    try {
        const urlObj = new URL(url);

        // youtube.com/watch?v=... or m.youtube.com/watch?v=...
        if (urlObj.hostname === 'www.youtube.com' ||
            urlObj.hostname === 'youtube.com' ||
            urlObj.hostname === 'm.youtube.com') {
            if (urlObj.pathname === '/watch') {
                return urlObj.searchParams.get('v');
            }
            // /embed/VIDEO_ID or /v/VIDEO_ID
            if (urlObj.pathname.startsWith('/embed/') || urlObj.pathname.startsWith('/v/')) {
                return urlObj.pathname.split('/')[2]?.split('?')[0];
            }
        }

        // youtu.be/VIDEO_ID
        if (urlObj.hostname === 'youtu.be') {
            return urlObj.pathname.slice(1).split('?')[0];
        }
    } catch (e) {
        // Invalid URL
        return null;
    }

    return null;
}

// Check if URL is a YouTube URL
function isYouTubeUrl(url) {
    if (!url) return false;
    try {
        const urlObj = new URL(url);
        return urlObj.hostname === 'www.youtube.com' ||
               urlObj.hostname === 'youtube.com' ||
               urlObj.hostname === 'm.youtube.com' ||
               urlObj.hostname === 'youtu.be';
    } catch (e) {
        return false;
    }
}

// Load YouTube IFrame API
function loadYouTubeApi() {
    if (ytApiReady || ytApiLoading) return;

    ytApiLoading = true;

    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

// Callback when YouTube API is ready
function onYouTubeIframeAPIReady() {
    ytApiReady = true;
    ytApiLoading = false;

    // If there's a pending video to play, play it
    if (window._pendingYouTubeVideoId) {
        createYouTubePlayer(window._pendingYouTubeVideoId);
        window._pendingYouTubeVideoId = null;
    }
}

// Make it globally accessible
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

// Create YouTube player with hidden controls
function createYouTubePlayer(videoId) {
    // Store videoId for later reference
    window._currentYouTubeVideoId = videoId;

    if (!ytApiReady) {
        // API not ready yet, queue the video
        loadYouTubeApi();
        window._pendingYouTubeVideoId = videoId;
        return;
    }

    // Destroy existing player if any
    if (ytPlayer) {
        ytPlayer.destroy();
        ytPlayer = null;
    }

    // Stop progress interval
    if (ytProgressInterval) {
        clearInterval(ytProgressInterval);
        ytProgressInterval = null;
    }

    // Clear the embedded player container
    embeddedPlayer.innerHTML = '';

    // Show embedded player, hide video player
    videoPlayer.classList.add('hidden');
    embeddedPlayer.classList.remove('hidden');

    // Check play mode for looping
    const playMode = typeof getPlayMode === 'function' ? getPlayMode() : 'once';
    const shouldLoop = playMode === 'repeat-one';

    // Build playerVars - enable YouTube controls
    const playerVars = {
        'playsinline': 1,
        'autoplay': 1,
        'controls': 1,        // Enable YouTube controls
        'modestbranding': 1,  // Reduce YouTube branding
        'rel': 0,             // Only show related videos from same channel
        'fs': 1,              // Enable fullscreen button
        'iv_load_policy': 3   // Hide annotations
    };

    // For repeat-one mode, enable YouTube's native loop
    // YouTube requires playlist parameter for loop to work
    if (shouldLoop) {
        playerVars['loop'] = 1;
        playerVars['playlist'] = videoId;
    }

    // Create YouTube player with YouTube controls enabled
    ytPlayer = new YT.Player('embeddedPlayer', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: playerVars,
        events: {
            'onReady': onYouTubePlayerReady,
            'onStateChange': onYouTubePlayerStateChange,
            'onError': onYouTubePlayerError
        }
    });
}

// Format time for display
function formatYtTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Update progress display for YouTube
function updateYtProgress() {
    if (!ytPlayer || !ytPlayer.getCurrentTime || !ytPlayer.getDuration) return;

    const currentTime = ytPlayer.getCurrentTime();
    const duration = ytPlayer.getDuration();

    if (!duration || duration === 0) return;

    const progressBar = document.getElementById("progressBar");
    const npProgressBar = document.getElementById("npProgressBar");
    const timeDisplay = document.getElementById("timeDisplay");
    const npTimeDisplay = document.getElementById("npTimeDisplay");

    const percent = (currentTime / duration) * 100;

    if (progressBar) progressBar.value = percent;
    if (npProgressBar) npProgressBar.value = percent;

    const timeText = `${formatYtTime(currentTime)} / ${formatYtTime(duration)}`;
    if (timeDisplay && !window.timeInputActive) timeDisplay.textContent = timeText;
    if (npTimeDisplay && !window.npTimeInputActive) npTimeDisplay.textContent = timeText;
}

// YouTube player ready
function onYouTubePlayerReady(event) {
    event.target.playVideo();

    // Hide our controls panel - YouTube has its own controls
    const controls = document.getElementById("controls");
    if (controls) controls.classList.add("hidden");

    // Show the trigger zone (button starts hidden)
    const triggerZone = document.getElementById("embeddedShowBtnTriggerZone");
    const showBtn = document.getElementById("embeddedShowControlsBtn");
    if (triggerZone) triggerZone.classList.remove("hidden");
    if (showBtn) showBtn.classList.add("hidden"); // Button hidden until mouse enters trigger zone

    // Set volume from stored preference
    const storedVolume = localStorage.getItem('volume');
    if (storedVolume) {
        const vol = parseInt(storedVolume, 10);
        ytPlayer.setVolume(vol);
        const volumeSlider = document.getElementById("volumeSlider");
        const npVolumeSlider = document.getElementById("npVolumeSlider");
        if (volumeSlider) volumeSlider.value = vol;
        if (npVolumeSlider) npVolumeSlider.value = vol;
    }

    // Update title and Now Playing info
    const videoData = ytPlayer.getVideoData();
    const videoId = videoData?.video_id || window._currentYouTubeVideoId || '';
    const videoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : 'YouTube';

    if (videoData && videoData.title) {
        document.title = videoData.title + ' - PWA Player';
        navigator.mediaSession.metadata = new MediaMetadata({
            title: videoData.title,
            artist: videoData.author || 'YouTube',
            album: 'YouTube'
        });

        // Update Now Playing info
        const titleEl = document.querySelector("#nowPlayingInfo .track-title");
        const artistEl = document.querySelector("#nowPlayingInfo .track-artist");
        const urlEl = document.querySelector("#nowPlayingInfo .track-url");
        if (titleEl) titleEl.textContent = videoData.title;
        if (artistEl) artistEl.textContent = videoData.author || 'YouTube';
        if (urlEl) urlEl.textContent = videoUrl;
    }

    // Start progress update interval
    ytProgressInterval = setInterval(updateYtProgress, 500);
}

// YouTube player state change
function onYouTubePlayerStateChange(event) {
    // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)

    const playBtn = document.getElementById("playBtn");
    const npPlayBtn = document.getElementById("npPlayBtn");

    if (event.data === YT.PlayerState.PLAYING) {
        if (playBtn) playBtn.textContent = "⏸️";
        if (npPlayBtn) npPlayBtn.textContent = "⏸️";
        navigator.mediaSession.playbackState = 'playing';

        // Resume progress updates
        if (!ytProgressInterval) {
            ytProgressInterval = setInterval(updateYtProgress, 500);
        }
    } else if (event.data === YT.PlayerState.PAUSED) {
        if (playBtn) playBtn.textContent = "▶️";
        if (npPlayBtn) npPlayBtn.textContent = "▶️";
        navigator.mediaSession.playbackState = 'paused';
    } else if (event.data === YT.PlayerState.ENDED) {
        if (playBtn) playBtn.textContent = "▶️";
        if (npPlayBtn) npPlayBtn.textContent = "▶️";
        navigator.mediaSession.playbackState = 'paused';

        // Stop progress updates
        if (ytProgressInterval) {
            clearInterval(ytProgressInterval);
            ytProgressInterval = null;
        }

        // Handle play mode behavior like normal videos
        handleYouTubeVideoEnded();
    } else if (event.data === YT.PlayerState.BUFFERING) {
        // Keep updating during buffering
    }
}

// Handle YouTube video ending - respect play mode like normal videos
function handleYouTubeVideoEnded() {
    const playMode = typeof getPlayMode === 'function' ? getPlayMode() : 'once';

    // For repeat-one mode, replay the same video
    if (playMode === 'repeat-one') {
        if (ytPlayer) {
            ytPlayer.seekTo(0, true);
            ytPlayer.playVideo();
        }
        return;
    }

    // For other modes, try to play next in queue
    if (typeof playNext === 'function') {
        playNext();
    }
}

// YouTube player error
function onYouTubePlayerError(event) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    // Error codes: 2 (invalid video id), 5 (HTML5 error), 100 (video not found), 101/150 (video not allowed)
    let errorMsg = t('youtubeError', 'YouTube playback error');

    switch (event.data) {
        case 2:
            errorMsg = t('youtubeInvalidId', 'Invalid YouTube video ID');
            break;
        case 5:
            errorMsg = t('youtubeHtml5Error', 'YouTube HTML5 player error');
            break;
        case 100:
            errorMsg = t('youtubeNotFound', 'YouTube video not found or removed');
            break;
        case 101:
        case 150:
            errorMsg = t('youtubeNotAllowed', 'YouTube video not allowed to be embedded');
            break;
    }

    alert(errorMsg);

    // Switch back to video player
    stopEmbeddedPlayer();
}

// Stop embedded player and switch back to video player
function stopEmbeddedPlayer() {
    if (ytPlayer) {
        ytPlayer.stopVideo();
        ytPlayer.destroy();
        ytPlayer = null;
    }

    if (ytProgressInterval) {
        clearInterval(ytProgressInterval);
        ytProgressInterval = null;
    }

    window._currentYouTubeVideoId = null;

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

// Play from embedded URL (YouTube, etc.)
function playEmbeddedUrl(url) {
    if (isYouTubeUrl(url)) {
        const videoId = extractYouTubeVideoId(url);
        if (videoId) {
            createYouTubePlayer(videoId);
            return true;
        }
    }

    // Not a supported embedded URL
    return false;
}

// Check if embedded player is active
function isEmbeddedPlayerActive() {
    return !embeddedPlayer.classList.contains('hidden');
}

// Toggle play/pause for embedded player
function toggleEmbeddedPlayerPlayPause() {
    if (!ytPlayer) return;

    const state = ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
        ytPlayer.pauseVideo();
    } else {
        ytPlayer.playVideo();
    }
}

// Seek YouTube video
function seekYtPlayer(percent) {
    if (!ytPlayer || !ytPlayer.getDuration) return;

    const duration = ytPlayer.getDuration();
    const targetTime = (percent / 100) * duration;
    ytPlayer.seekTo(targetTime, true);
}

// Set YouTube volume
function setYtVolume(percent) {
    if (!ytPlayer) return;

    ytPlayer.setVolume(percent);
    localStorage.setItem('volume', percent.toString());
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
        seekYtPlayer(parseFloat(e.target.value));
    }
});

document.getElementById("npProgressBar")?.addEventListener("input", (e) => {
    if (isEmbeddedPlayerActive()) {
        seekYtPlayer(parseFloat(e.target.value));
    }
});

// Hook into volume slider
document.getElementById("volumeSlider")?.addEventListener("input", (e) => {
    if (isEmbeddedPlayerActive()) {
        setYtVolume(parseInt(e.target.value, 10));
    }
});

document.getElementById("npVolumeSlider")?.addEventListener("input", (e) => {
    if (isEmbeddedPlayerActive()) {
        setYtVolume(parseInt(e.target.value, 10));
    }
});

// MediaSession handlers for embedded player
if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => {
        if (isEmbeddedPlayerActive() && ytPlayer) {
            ytPlayer.playVideo();
        }
    });

    navigator.mediaSession.setActionHandler('pause', () => {
        if (isEmbeddedPlayerActive() && ytPlayer) {
            ytPlayer.pauseVideo();
        }
    });

    navigator.mediaSession.setActionHandler('stop', () => {
        if (isEmbeddedPlayerActive()) {
            stopEmbeddedPlayer();
        }
    });

    navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (isEmbeddedPlayerActive() && ytPlayer && details.seekTime) {
            ytPlayer.seekTo(details.seekTime, true);
        }
    });
}

// Auto-hide timers
let showBtnAutoHideTimer = null;
let controlsAutoHideTimer = null;

// Get auto-hide delay from settings (default 5 seconds)
function getEmbeddedAutoHideDelay() {
    const delay = parseInt(localStorage.getItem("embeddedControlsHideDelay"), 10);
    return delay > 0 ? delay : 5000;
}

// Start auto-hide timer for the floating show button (3 seconds)
function startShowBtnAutoHide() {
    if (showBtnAutoHideTimer) {
        clearTimeout(showBtnAutoHideTimer);
    }

    showBtnAutoHideTimer = setTimeout(() => {
        if (isEmbeddedPlayerActive()) {
            const showBtn = document.getElementById("embeddedShowControlsBtn");
            const triggerZone = document.getElementById("embeddedShowBtnTriggerZone");
            if (showBtn) showBtn.classList.add("hidden"); // Hide button
            // Trigger zone remains visible for future hover
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
            if (triggerZone) triggerZone.classList.remove("hidden"); // Show trigger zone again
        }
    }, getEmbeddedAutoHideDelay());
}

// Show controls and start auto-hide timer
function showEmbeddedControls() {
    const controls = document.getElementById("controls");
    const triggerZone = document.getElementById("embeddedShowBtnTriggerZone");
    const showBtn = document.getElementById("embeddedShowControlsBtn");

    if (!controls || !isEmbeddedPlayerActive()) return;

    controls.classList.remove("hidden");
    if (triggerZone) triggerZone.classList.add("hidden"); // Hide trigger zone while controls visible
    if (showBtn) showBtn.classList.add("hidden"); // Hide button while controls visible

    startControlsAutoHide();
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
}

// Floating button click handler
const showBtn = document.getElementById("embeddedShowControlsBtn");
if (showBtn) {
    showBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showEmbeddedControls();
    });
}

// Touch on trigger zone also shows the button (for mobile)
if (triggerZone) {
    triggerZone.addEventListener("touchstart", () => {
        if (!isEmbeddedPlayerActive()) return;

        const showBtn = document.getElementById("embeddedShowControlsBtn");
        if (showBtn) {
            showBtn.classList.remove("hidden");
            startShowBtnAutoHide();
        }
    }, { passive: true });
}

// Click outside controls to hide them
document.addEventListener("click", (e) => {
    if (!isEmbeddedPlayerActive()) return;

    const controls = document.getElementById("controls");
    const overlay = document.getElementById("embeddedPlayerOverlay");
    const showBtn = document.getElementById("embeddedShowControlsBtn");
    const embeddedPlayerEl = document.getElementById("embeddedPlayer");

    if (!controls) return;

    // If controls are visible and click is outside controls and not on showBtn
    if (!controls.classList.contains("hidden")) {
        const target = e.target;
        // Allow clicks on overlay, embeddedPlayer, and our UI - only hide if truly outside
        if (!controls.contains(target) && target !== showBtn && target !== overlay && !embeddedPlayerEl?.contains(target)) {
            // Hide controls and overlay
            controls.classList.add("hidden");
            if (overlay) overlay.classList.add("hidden");
        }
    }
});

// Detect fullscreen changes (user clicking YouTube's fullscreen button)
document.addEventListener("fullscreenchange", () => {
    if (!isEmbeddedPlayerActive()) return;

    const controls = document.getElementById("controls");
    const showBtn = document.getElementById("embeddedShowControlsBtn");
    const fullscreenBtn = document.getElementById("fullscreenBtn");
    const npFullscreenBtn = document.getElementById("npFullscreenBtn");

    const isFullscreen = document.fullscreenElement !== null;

    // Update our fullscreen button icons
    if (fullscreenBtn) fullscreenBtn.textContent = isFullscreen ? "⛶" : "FullScreen";
    if (npFullscreenBtn) npFullscreenBtn.textContent = isFullscreen ? "⛶" : "FullScreen";

    if (isFullscreen) {
        // In fullscreen - hide our controls and trigger zone
        // YouTube has its own fullscreen controls
        if (controls) controls.classList.add("hidden");
        const triggerZone = document.getElementById("embeddedShowBtnTriggerZone");
        if (triggerZone) triggerZone.classList.add("hidden");
        if (showBtn) showBtn.classList.add("hidden");

        // Clear timers
        if (showBtnAutoHideTimer) {
            clearTimeout(showBtnAutoHideTimer);
            showBtnAutoHideTimer = null;
        }
        if (controlsAutoHideTimer) {
            clearTimeout(controlsAutoHideTimer);
            controlsAutoHideTimer = null;
        }
    } else {
        // Exited fullscreen - show trigger zone again (if controls were hidden)
        if (controls && controls.classList.contains("hidden")) {
            const triggerZone = document.getElementById("embeddedShowBtnTriggerZone");
            if (triggerZone) triggerZone.classList.remove("hidden");
        }
    }
});

// Also listen for webkit fullscreen change (Safari)
document.addEventListener("webkitfullscreenchange", () => {
    if (!isEmbeddedPlayerActive()) return;

    const controls = document.getElementById("controls");
    const fullscreenBtn = document.getElementById("fullscreenBtn");
    const npFullscreenBtn = document.getElementById("npFullscreenBtn");

    const isFullscreen = document.webkitFullscreenElement !== null;

    // Update our fullscreen button icons
    if (fullscreenBtn) fullscreenBtn.textContent = isFullscreen ? "⛶" : "FullScreen";
    if (npFullscreenBtn) npFullscreenBtn.textContent = isFullscreen ? "⛶" : "FullScreen";

    if (isFullscreen) {
        // In fullscreen - hide our controls and trigger zone
        // YouTube has its own fullscreen controls
        if (controls) controls.classList.add("hidden");
        const triggerZone = document.getElementById("embeddedShowBtnTriggerZone");
        const showBtn = document.getElementById("embeddedShowControlsBtn");
        if (triggerZone) triggerZone.classList.add("hidden");
        if (showBtn) showBtn.classList.add("hidden");

        // Clear timers
        if (showBtnAutoHideTimer) {
            clearTimeout(showBtnAutoHideTimer);
            showBtnAutoHideTimer = null;
        }
        if (controlsAutoHideTimer) {
            clearTimeout(controlsAutoHideTimer);
            controlsAutoHideTimer = null;
        }
    } else {
        // Exited fullscreen - show trigger zone again (if controls were hidden)
        if (controls && controls.classList.contains("hidden")) {
            const triggerZone = document.getElementById("embeddedShowBtnTriggerZone");
            if (triggerZone) triggerZone.classList.remove("hidden");
        }
    }
});