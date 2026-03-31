const settingsYearEl = document.getElementById("settingsYear");
settingsYearEl.textContent = `2025–${new Date().getFullYear()}`;

// Default network retry count (used across the project)
const DEFAULT_NETWORK_RETRY_COUNT = 256;

let settingsClickCount = 0;

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}

// Startup view - switch to saved view on boot
function applyStartupView() {
  const startupView = localStorage.getItem("startupView") || "player";
  if (startupView !== "player") {
    const viewMap = {
      "nowPlaying": "nowPlayingView",
      "playlist": "playlistView",
      "storage": "storageView",
      "iptv": "iptvView",
      "settings": "settingsView"
    };
    const targetView = viewMap[startupView];
    if (targetView && document.getElementById(targetView)) {
      switchView(targetView);
    }
  }
}

// Apply startup view when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applyStartupView);
} else {
  applyStartupView();
}

settingsYearEl.addEventListener("click", () => {
    ++settingsClickCount;

    if (settingsClickCount >= 5) {
        settingsClickCount = 0;

        const enabled = localStorage.getItem("hiddenfeatures") === "true";

        if (enabled) {
            localStorage.removeItem("hiddenfeatures");
            showToast("Hidden features disabled");
        } else {
            localStorage.setItem("hiddenfeatures", "true");
            showToast("Hidden features enabled");
        }
    }
});

document.getElementById("settingsBtn").addEventListener("click", () => {
    switchView("settingsView");
});

document.getElementById("settingsCloseBtn").addEventListener("click", () => {
    closeActiveView();
});

// Language selection
const languageSelect = document.getElementById("languageSelect");

languageSelect.addEventListener("change", () => {
    const newLang = languageSelect.value;
    if (window.i18n && window.i18n.setLanguage(newLang)) {
        showToast(window.i18n.t('languageChanged') || "Language changed");
    }
});

// Subtitle in MediaSession toggle
const subtitleInMediaSessionCheckbox = document.getElementById("subtitleInMediaSession");

// Load saved preference (default: true)
subtitleInMediaSessionCheckbox.checked = localStorage.getItem("subtitleInMediaSession") !== "false";

subtitleInMediaSessionCheckbox.addEventListener("change", () => {
    localStorage.setItem("subtitleInMediaSession", subtitleInMediaSessionCheckbox.checked ? "true" : "false");
});

// Helper function to check if subtitle in MediaSession is enabled
function isSubtitleInMediaSessionEnabled() {
    return localStorage.getItem("subtitleInMediaSession") !== "false";
}

// Auto-load subtitle toggle
const autoLoadSubtitleCheckbox = document.getElementById("autoLoadSubtitle");

// Load saved preference (default: true)
autoLoadSubtitleCheckbox.checked = localStorage.getItem("autoLoadSubtitle") !== "false";

autoLoadSubtitleCheckbox.addEventListener("change", () => {
    localStorage.setItem("autoLoadSubtitle", autoLoadSubtitleCheckbox.checked ? "true" : "false");
});

// Helper function to check if auto-load subtitle is enabled
function isAutoLoadSubtitleEnabled() {
    return localStorage.getItem("autoLoadSubtitle") !== "false";
}

// Auto-hide panel toggle
const autoHidePanelCheckbox = document.getElementById("autoHidePanel");

// Load saved preference (default: false - don't hide panel by default)
autoHidePanelCheckbox.checked = localStorage.getItem("autoHidePanel") === "true";

autoHidePanelCheckbox.addEventListener("change", () => {
    localStorage.setItem("autoHidePanel", autoHidePanelCheckbox.checked ? "true" : "false");
});

// Helper function to check if auto-hide panel is enabled
function isAutoHidePanelEnabled() {
    return localStorage.getItem("autoHidePanel") === "true";
}

// Auto-resize window toggle
const autoResizeWindowCheckbox = document.getElementById("autoResizeWindow");

// Load saved preference (default: false)
autoResizeWindowCheckbox.checked = localStorage.getItem("autoResizeWindow") === "true";

autoResizeWindowCheckbox.addEventListener("change", () => {
    localStorage.setItem("autoResizeWindow", autoResizeWindowCheckbox.checked ? "true" : "false");
});

// Helper function to check if auto-resize window is enabled
function isAutoResizeWindowEnabled() {
    return localStorage.getItem("autoResizeWindow") === "true";
}

// Resize window to video dimensions
function resizeWindowToVideo(videoWidth, videoHeight) {
    if (!isAutoResizeWindowEnabled()) return;

    // Only works in PWA standalone mode or window.open() context
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone ||
        document.referrer === '' ||
        window.opener) {

        // Use maximize if video has no dimensions (audio-only webm, etc.)
        const useDefault = !videoWidth || !videoHeight;

        try {
            if (useDefault) {
                // Maximize window for audio-only content
                window.resizeTo(screen.availWidth, screen.availHeight);
                window.moveTo(0, 0);
            } else {
                // Resize to video dimensions
                const chromeWidth = window.outerWidth - window.innerWidth;
                const chromeHeight = window.outerHeight - window.innerHeight;

                const maxWidth = screen.availWidth - 100;
                const maxHeight = screen.availHeight - 100;

                // Minimum 16:9 size to ensure controls are visible
                const minWidth = 640;
                const minHeight = 360;

                const finalWidth = Math.max(Math.min(videoWidth + chromeWidth, maxWidth), minWidth);
                const finalHeight = Math.max(Math.min(videoHeight + chromeHeight, maxHeight), minHeight);

                window.resizeTo(finalWidth, finalHeight);
                window.moveTo(
                    Math.floor((screen.availWidth - finalWidth) / 2),
                    Math.floor((screen.availHeight - finalHeight) / 2)
                );
            }
        } catch (err) {
            console.warn("Window resize failed:", err);
        }
    }
}

// Startup view selection
const startupViewSelect = document.getElementById("startupViewSelect");

// Load saved preference (default: player)
startupViewSelect.value = localStorage.getItem("startupView") || "player";

startupViewSelect.addEventListener("change", () => {
    localStorage.setItem("startupView", startupViewSelect.value);
});

// Disable rotate button toggle
const disableRotateBtnCheckbox = document.getElementById("disableRotateBtn");

// Load saved preference (default: false - rotate button enabled)
disableRotateBtnCheckbox.checked = localStorage.getItem("disableRotateBtn") === "true";

// Apply initial state
if (rotationBtn && disableRotateBtnCheckbox.checked) {
    rotationBtn.style.display = "none";
}

disableRotateBtnCheckbox.addEventListener("change", () => {
    localStorage.setItem("disableRotateBtn", disableRotateBtnCheckbox.checked ? "true" : "false");
    if (rotationBtn) {
        rotationBtn.style.display = disableRotateBtnCheckbox.checked ? "none" : "";
    }
});

// Helper function to check if rotate button is disabled
function isRotateBtnDisabled() {
    return localStorage.getItem("disableRotateBtn") === "true";
}

// =====================================================
// Playback Speed Control
// =====================================================
const speedSlider = document.getElementById("speedSlider");
const speedValue = document.getElementById("speedValue");
const speedDown = document.getElementById("speedDown");
const speedUp = document.getElementById("speedUp");
const speedReset = document.getElementById("speedReset");
const preservePitchCheckbox = document.getElementById("preservePitch");
const speedAudioOnlyCheckbox = document.getElementById("speedAudioOnly");
const speedStepInput = document.getElementById("speedStepInput");
const speedDownLabel = document.getElementById("speedDownLabel");
const speedUpLabel = document.getElementById("speedUpLabel");
const shortcutSpeedEnabled = document.getElementById("shortcutSpeedEnabled");
const shortcutLoopEnabled = document.getElementById("shortcutLoopEnabled");
const videoPreviewEnabledCheckbox = document.getElementById("videoPreviewEnabled");

// Default speed is 1.0
const DEFAULT_PLAYBACK_SPEED = 1.0;
const DEFAULT_SPEED_STEP = 0.05;

// Get speed step
function getSpeedStep() {
    const step = parseFloat(localStorage.getItem("speedStep")) || DEFAULT_SPEED_STEP;
    return Math.max(0.01, Math.min(1, step));
}

// Update step labels
function updateStepLabels() {
    const step = getSpeedStep();
    if (speedDownLabel) speedDownLabel.textContent = step.toFixed(2);
    if (speedUpLabel) speedUpLabel.textContent = step.toFixed(2);
}

// Get shortcut settings
function isShortcutSpeedEnabled() {
    return localStorage.getItem("shortcutSpeedEnabled") !== "false";
}

function isShortcutLoopEnabled() {
    return localStorage.getItem("shortcutLoopEnabled") !== "false";
}

function isVideoPreviewEnabled() {
    return localStorage.getItem("videoPreviewEnabled") !== "false";
}

// Get current playback speed
function getPlaybackSpeed() {
    const speed = parseFloat(localStorage.getItem("playbackSpeed")) || DEFAULT_PLAYBACK_SPEED;
    return Math.max(0.1, Math.min(16, speed));
}

// Get preserve pitch setting (default: false - pitch changes with speed)
function getPreservePitch() {
    return localStorage.getItem("preservePitch") === "true";
}

// Get speed audio only setting (default: false - speed applies to all media)
function isSpeedAudioOnly() {
    return localStorage.getItem("speedAudioOnly") === "true";
}

// Update speed display
function updateSpeedDisplay(speed) {
    speedValue.value = speed.toFixed(2);
    // Slider only covers 0.25-4 range
    if (speed >= 0.25 && speed <= 4) {
        speedSlider.value = speed;
    }
}

// Apply speed to video element (only for non-live videos)
function applyPlaybackSpeed() {
    const video = document.getElementById("player");
    if (!video) return;

    // Skip for live streams (infinite duration)
    if (!isFinite(video.duration) || video.duration === Infinity) {
        return;
    }

    // Check if speed should only apply to audio
    if (isSpeedAudioOnly()) {
        // Check if current media is a video (has dimensions)
        if (video.videoWidth && video.videoHeight && video.videoWidth > 0 && video.videoHeight > 0) {
            // It's a video - reset to default speed
            video.playbackRate = 1.0;
            if ('preservesPitch' in video) {
                video.preservesPitch = true;
            }
            return;
        }
    }

    const speed = getPlaybackSpeed();
    const preservePitch = getPreservePitch();

    video.playbackRate = speed;

    // Set preservesPitch if supported
    if ('preservesPitch' in video) {
        video.preservesPitch = preservePitch;
    }
}

// Initialize speed controls
function initPlaybackSpeed() {
    const speed = getPlaybackSpeed();
    updateSpeedDisplay(speed);
    preservePitchCheckbox.checked = getPreservePitch();
    if (speedAudioOnlyCheckbox) speedAudioOnlyCheckbox.checked = isSpeedAudioOnly();
    speedStepInput.value = getSpeedStep();
    updateStepLabels();
    shortcutSpeedEnabled.checked = isShortcutSpeedEnabled();
    shortcutLoopEnabled.checked = isShortcutLoopEnabled();
    if (videoPreviewEnabledCheckbox) videoPreviewEnabledCheckbox.checked = isVideoPreviewEnabled();
}

// Save and apply speed
function setPlaybackSpeed(speed) {
    // Allow any reasonable speed (0.1 to 16)
    speed = Math.max(0.1, Math.min(16, speed));
    localStorage.setItem("playbackSpeed", speed.toString());
    updateSpeedDisplay(speed);
    applyPlaybackSpeed();
}

// Event listeners
speedValue.addEventListener("change", () => {
    let speed = parseFloat(speedValue.value);
    if (isNaN(speed) || speed <= 0) {
        speed = DEFAULT_PLAYBACK_SPEED;
    }
    setPlaybackSpeed(speed);
});

speedStepInput.addEventListener("change", () => {
    let step = parseFloat(speedStepInput.value);
    if (isNaN(step) || step <= 0) {
        step = DEFAULT_SPEED_STEP;
    }
    step = Math.max(0.01, Math.min(1, step));
    localStorage.setItem("speedStep", step.toString());
    speedStepInput.value = step;
    updateStepLabels();
});

speedSlider.addEventListener("input", () => {
    const speed = parseFloat(speedSlider.value);
    updateSpeedDisplay(speed);
});

speedSlider.addEventListener("change", () => {
    const speed = parseFloat(speedSlider.value);
    setPlaybackSpeed(speed);
});

speedDown.addEventListener("click", () => {
    const currentSpeed = getPlaybackSpeed();
    setPlaybackSpeed(currentSpeed - getSpeedStep());
});

speedUp.addEventListener("click", () => {
    const currentSpeed = getPlaybackSpeed();
    setPlaybackSpeed(currentSpeed + getSpeedStep());
});

speedReset.addEventListener("click", () => {
    setPlaybackSpeed(DEFAULT_PLAYBACK_SPEED);
});

preservePitchCheckbox.addEventListener("change", () => {
    localStorage.setItem("preservePitch", preservePitchCheckbox.checked ? "true" : "false");
    applyPlaybackSpeed();
});

if (speedAudioOnlyCheckbox) {
    speedAudioOnlyCheckbox.addEventListener("change", () => {
        localStorage.setItem("speedAudioOnly", speedAudioOnlyCheckbox.checked ? "true" : "false");
        applyPlaybackSpeed();
    });
}

shortcutSpeedEnabled.addEventListener("change", () => {
    localStorage.setItem("shortcutSpeedEnabled", shortcutSpeedEnabled.checked ? "true" : "false");
});

shortcutLoopEnabled.addEventListener("change", () => {
    localStorage.setItem("shortcutLoopEnabled", shortcutLoopEnabled.checked ? "true" : "false");
});

if (videoPreviewEnabledCheckbox) {
    videoPreviewEnabledCheckbox.addEventListener("change", () => {
        localStorage.setItem("videoPreviewEnabled", videoPreviewEnabledCheckbox.checked ? "true" : "false");
    });
}

// =====================================================
// Keyboard shortcuts for speed and A-B loop
// =====================================================

// A-B Loop state
let abLoopStart = null;
let abLoopEnd = null;
let abLoopActive = false;
let abLoopCheckInterval = null;
let abLoopState = 0; // 0: off, 1: A set, 2: AB active

// Show status overlay (reused from player.js)
function showStatusOverlay(message, duration = 1500) {
    const overlay = document.getElementById("videoStatusOverlay");
    const icon = document.getElementById("videoStatusIcon");
    const text = document.getElementById("videoStatusText");
    if (!overlay || !text) return;

    icon.className = "video-status-icon";
    icon.textContent = "";
    text.textContent = message;
    overlay.classList.remove("hidden");

    setTimeout(() => {
        overlay.classList.add("hidden");
    }, duration);
}

// Show speed status
function showSpeedStatus(speed) {
    showStatusOverlay(`Speed: ${speed.toFixed(2)}x`, 1200);
}

// Show A-B loop status
function showABLoopStatus(message) {
    showStatusOverlay(message, 1500);
}

// Update AB button text
function updateABLoopButton() {
    const btn = document.getElementById("abLoopBtn");
    if (!btn) return;

    switch (abLoopState) {
        case 0:
            btn.textContent = "A";
            break;
        case 1:
            btn.textContent = "B";
            break;
        case 2:
            btn.textContent = "AB";
            break;
    }
}

// Reset AB loop to A state (keep start point, deactivate loop)
function resetABLoopToA() {
    stopABLoopCheck();
    abLoopEnd = null;
    abLoopActive = false;
    abLoopState = abLoopStart !== null ? 1 : 0;
    updateABLoopButton();
}

// Clear AB loop completely
function clearABLoop() {
    stopABLoopCheck();
    abLoopStart = null;
    abLoopEnd = null;
    abLoopActive = false;
    abLoopState = 0;
    updateABLoopButton();
}

// Handle AB button click (cycles: A -> B -> AB -> A)
function handleABLoopClick() {
    const video = document.getElementById("player");
    if (!video || !isNonLiveVideo()) return;

    switch (abLoopState) {
        case 0:
            // Set A point
            abLoopStart = video.currentTime;
            abLoopEnd = null;
            abLoopActive = false;
            abLoopState = 1;
            showABLoopStatus(`A: ${formatTime(abLoopStart)}`);
            break;

        case 1:
            // Set B point and activate
            abLoopEnd = video.currentTime;
            if (abLoopEnd > abLoopStart) {
                abLoopActive = true;
                abLoopState = 2;
                startABLoopCheck();
                showABLoopStatus(`A-B: ${formatTime(abLoopStart)} - ${formatTime(abLoopEnd)}`);
            } else {
                showABLoopStatus("B must be after A");
            }
            break;

        case 2:
            // Reset to A (keep start point)
            resetABLoopToA();
            showABLoopStatus("Loop off (A kept)");
            break;
    }

    updateABLoopButton();
}

// Initialize AB loop button
const abLoopBtn = document.getElementById("abLoopBtn");
if (abLoopBtn) {
    abLoopBtn.addEventListener("click", handleABLoopClick);
    updateABLoopButton();
}

// Auto-set B point when video ends (if A is set)
const videoForABLoop = document.getElementById("player");
if (videoForABLoop) {
    videoForABLoop.addEventListener("ended", () => {
        // If A point is set but not B, auto-set B to end and start loop
        if (abLoopState === 1 && abLoopStart !== null) {
            const video = document.getElementById("player");
            abLoopEnd = video.duration;
            abLoopActive = true;
            abLoopState = 2;
            startABLoopCheck();
            updateABLoopButton();
            showABLoopStatus(`A-B: ${formatTime(abLoopStart)} - ${formatTime(abLoopEnd)}`);
            // Seek back to A and play
            video.currentTime = abLoopStart;
            video.play().catch(() => {});
        }
    });

    // Reset AB loop to A when video source changes
    videoForABLoop.addEventListener("loadstart", () => {
        if (abLoopState === 2) {
            resetABLoopToA();
        }
    });

    // Reset AB loop to A when video is paused/stopped for a while
    videoForABLoop.addEventListener("pause", () => {
        // Don't reset immediately on pause, only reset the loop check
        if (abLoopActive) {
            // Loop will resume when playing again
        }
    });
}

// Check if video is non-live
function isNonLiveVideo() {
    const video = document.getElementById("player");
    if (!video || !video.src) return false;
    return isFinite(video.duration) && video.duration !== Infinity;
}

// Format time helper
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Start A-B loop checking
function startABLoopCheck() {
    if (abLoopCheckInterval) return;

    abLoopCheckInterval = setInterval(() => {
        const video = document.getElementById("player");
        if (!video || video.paused || !abLoopActive) return;

        if (abLoopEnd !== null && video.currentTime >= abLoopEnd) {
            video.currentTime = abLoopStart;
        }
    }, 100);
}

// Stop A-B loop checking
function stopABLoopCheck() {
    if (abLoopCheckInterval) {
        clearInterval(abLoopCheckInterval);
        abLoopCheckInterval = null;
    }
}

// Keyboard event handler
document.addEventListener("keydown", (e) => {
    // Ignore if typing in input/textarea
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    const video = document.getElementById("player");
    if (!video) return;

    const step = getSpeedStep();

    switch (e.key.toLowerCase()) {
        case "a":
            // A: Decrease speed
            if (isShortcutSpeedEnabled() && isNonLiveVideo()) {
                const newSpeed = getPlaybackSpeed() - step;
                setPlaybackSpeed(newSpeed);
                showSpeedStatus(getPlaybackSpeed());
            }
            break;

        case "d":
            // D: Increase speed
            if (isShortcutSpeedEnabled() && isNonLiveVideo()) {
                const newSpeed = getPlaybackSpeed() + step;
                setPlaybackSpeed(newSpeed);
                showSpeedStatus(getPlaybackSpeed());
            }
            break;

        case "s":
            // S: Reset speed to 1.00x
            if (isShortcutSpeedEnabled() && isNonLiveVideo()) {
                setPlaybackSpeed(DEFAULT_PLAYBACK_SPEED);
                showSpeedStatus(1.0);
            }
            break;

        case "j":
            // J: Set A point
            if (isShortcutLoopEnabled() && isNonLiveVideo()) {
                abLoopStart = video.currentTime;
                abLoopEnd = null;
                abLoopActive = false;
                abLoopState = 1;
                updateABLoopButton();
                showABLoopStatus(`A: ${formatTime(abLoopStart)}`);
            }
            break;

        case "l":
            // L: Set B point and activate
            if (isShortcutLoopEnabled() && isNonLiveVideo() && abLoopState === 1) {
                abLoopEnd = video.currentTime;
                if (abLoopEnd > abLoopStart) {
                    abLoopActive = true;
                    abLoopState = 2;
                    startABLoopCheck();
                    updateABLoopButton();
                    showABLoopStatus(`A-B: ${formatTime(abLoopStart)} - ${formatTime(abLoopEnd)}`);
                } else {
                    showABLoopStatus("B must be after A");
                }
            }
            break;

        case "k":
            // K: Clear AB loop
            if (isShortcutLoopEnabled() && abLoopState !== 0) {
                clearABLoop();
                showABLoopStatus("Loop cleared");
            }
            break;
    }
});

// Initialize on load
initPlaybackSpeed();

// Apply speed when video loads/plays
const videoForSpeed = document.getElementById("player");
if (videoForSpeed) {
    videoForSpeed.addEventListener("loadedmetadata", applyPlaybackSpeed);
    videoForSpeed.addEventListener("durationchange", applyPlaybackSpeed);
    videoForSpeed.addEventListener("canplay", applyPlaybackSpeed);
    videoForSpeed.addEventListener("play", applyPlaybackSpeed);
}

// CORS Bypass Server setting
const corsBypassUrlInput = document.getElementById("corsBypassUrl");

if (corsBypassUrlInput) {
    corsBypassUrlInput.value = localStorage.getItem("corsBypassUrl") || "";
    corsBypassUrlInput.addEventListener("change", () => {
        const url = corsBypassUrlInput.value.trim();
        if (url) {
            localStorage.setItem("corsBypassUrl", url);
        } else {
            localStorage.removeItem("corsBypassUrl");
        }
    });
}

// CORS Bypass toggle
const corsBypassToggle = document.getElementById("corsBypassToggle");

if (corsBypassToggle) {
    corsBypassToggle.checked = localStorage.getItem("corsBypassEnabled") === "true";
    corsBypassToggle.addEventListener("change", () => {
        localStorage.setItem("corsBypassEnabled", corsBypassToggle.checked ? "true" : "false");
    });
}

// Helper function to get CORS bypass URL
function getCorsBypassUrl() {
    return localStorage.getItem("corsBypassUrl") || "";
}

// Helper function to check if CORS bypass is enabled
function isCorsBypassEnabled() {
    return localStorage.getItem("corsBypassEnabled") === "true";
}

// Helper function to apply CORS bypass to a URL
// corsBypass param: true = enable CORS bypass, false/null/undefined = disable
function applyCorsBypass(url, corsBypass) {
    if (!url || typeof url !== 'string') return url;
    if (!corsBypass) return url;

    const bypassUrl = getCorsBypassUrl();
    if (!bypassUrl) return url;

    // Only apply to http/https URLs
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return bypassUrl + url;
    }
    return url;
}

// Network retry count setting
const networkRetryInput = document.getElementById("networkRetryCount");

if (networkRetryInput) {
    networkRetryInput.value = localStorage.getItem("networkRetryCount") || DEFAULT_NETWORK_RETRY_COUNT.toString();
    networkRetryInput.addEventListener("change", () => {
        const count = parseInt(networkRetryInput.value, 10);
        if (count >= 0) {
            localStorage.setItem("networkRetryCount", count.toString());
        } else {
            localStorage.setItem("networkRetryCount", DEFAULT_NETWORK_RETRY_COUNT.toString());
            networkRetryInput.value = DEFAULT_NETWORK_RETRY_COUNT.toString();
        }
    });
}

// Helper function to get network retry count
function getNetworkRetryCount() {
    const count = parseInt(localStorage.getItem("networkRetryCount"), 10) || DEFAULT_NETWORK_RETRY_COUNT;
    return Math.max(0, count);
}

// Default IPTV source retry count (when multiple URLs exist)
const DEFAULT_IPTV_SOURCE_RETRY_COUNT = 8;

// Network retry count setting for IPTV sources (when multiple URLs)
const iptvSourceRetryInput = document.getElementById("iptvSourceRetryCount");

if (iptvSourceRetryInput) {
    iptvSourceRetryInput.value = localStorage.getItem("iptvSourceRetryCount") || DEFAULT_IPTV_SOURCE_RETRY_COUNT.toString();
    iptvSourceRetryInput.addEventListener("change", () => {
        const count = parseInt(iptvSourceRetryInput.value, 10);
        if (count >= 0) {
            localStorage.setItem("iptvSourceRetryCount", count.toString());
        } else {
            localStorage.setItem("iptvSourceRetryCount", DEFAULT_IPTV_SOURCE_RETRY_COUNT.toString());
            iptvSourceRetryInput.value = DEFAULT_IPTV_SOURCE_RETRY_COUNT.toString();
        }
    });
}

// Helper function to get IPTV source retry count
function getIptvSourceRetryCount() {
    const count = parseInt(localStorage.getItem("iptvSourceRetryCount"), 10) || DEFAULT_IPTV_SOURCE_RETRY_COUNT;
    return Math.max(0, count);
}
