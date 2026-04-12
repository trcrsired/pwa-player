const settingsYearEl = document.getElementById("settingsYear");
settingsYearEl.textContent = `2025–${new Date().getFullYear()}`;

// Default network retry count (used across the project)
const DEFAULT_NETWORK_RETRY_COUNT = 256;
const DEFAULT_RETRY_DELAY = 0; // 0ms - retry immediately
const DEFAULT_RETRY_BEFORE_SRC_RESET = 8; // Reset src after this many retries

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

// Controls auto-hide delay (applies to both normal video and embedded player)
const controlsAutoHideDelayInput = document.getElementById("controlsAutoHideDelayInput");

if (controlsAutoHideDelayInput) {
    controlsAutoHideDelayInput.value = localStorage.getItem("controlsAutoHideDelay") || "5000";
    controlsAutoHideDelayInput.addEventListener("change", () => {
        const delay = parseInt(controlsAutoHideDelayInput.value, 10);
        if (delay >= 0) {
            localStorage.setItem("controlsAutoHideDelay", delay.toString());
        } else {
            localStorage.setItem("controlsAutoHideDelay", "5000");
            controlsAutoHideDelayInput.value = "5000";
        }
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
            // Clear loop and start fresh (back to A state)
            clearABLoop();
            showABLoopStatus("Loop cleared");
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

    // Reset AB loop completely when video source changes
    videoForABLoop.addEventListener("loadstart", () => {
        if (abLoopState !== 0) {
            clearABLoop();
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
let previousSpeedBeforeReset = null; // Store speed before reset for toggle

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
            // S: Toggle speed between 1.0x and previous value
            if (isShortcutSpeedEnabled() && isNonLiveVideo()) {
                const currentSpeed = getPlaybackSpeed();
                if (Math.abs(currentSpeed - 1.0) < 0.001 && previousSpeedBeforeReset !== null) {
                    // Currently at 1.0, restore previous speed
                    setPlaybackSpeed(previousSpeedBeforeReset);
                    showSpeedStatus(previousSpeedBeforeReset);
                    previousSpeedBeforeReset = null;
                } else {
                    // Store current speed and reset to 1.0
                    previousSpeedBeforeReset = currentSpeed;
                    setPlaybackSpeed(DEFAULT_PLAYBACK_SPEED);
                    showSpeedStatus(1.0);
                }
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

// Retry delay setting (ms between retries)
const retryDelayInput = document.getElementById("retryDelay");

if (retryDelayInput) {
    retryDelayInput.value = localStorage.getItem("retryDelay") || DEFAULT_RETRY_DELAY.toString();
    retryDelayInput.addEventListener("change", () => {
        const delay = parseInt(retryDelayInput.value, 10);
        if (delay >= 100) { // Minimum 100ms
            localStorage.setItem("retryDelay", delay.toString());
        } else {
            localStorage.setItem("retryDelay", DEFAULT_RETRY_DELAY.toString());
            retryDelayInput.value = DEFAULT_RETRY_DELAY.toString();
        }
    });
}

// Helper function to get retry delay
function getRetryDelay() {
    const delay = parseInt(localStorage.getItem("retryDelay"), 10) || DEFAULT_RETRY_DELAY;
    return Math.max(100, delay); // Minimum 100ms
}

// Retry before src reset setting
const retryBeforeSrcResetInput = document.getElementById("retryBeforeSrcReset");

if (retryBeforeSrcResetInput) {
    retryBeforeSrcResetInput.value = localStorage.getItem("retryBeforeSrcReset") || DEFAULT_RETRY_BEFORE_SRC_RESET.toString();
    retryBeforeSrcResetInput.addEventListener("change", () => {
        const count = parseInt(retryBeforeSrcResetInput.value, 10);
        if (count >= 0) {
            localStorage.setItem("retryBeforeSrcReset", count.toString());
        } else {
            localStorage.setItem("retryBeforeSrcReset", DEFAULT_RETRY_BEFORE_SRC_RESET.toString());
            retryBeforeSrcResetInput.value = DEFAULT_RETRY_BEFORE_SRC_RESET.toString();
        }
    });
}

// Helper function to get retry before src reset count
function getRetryBeforeSrcReset() {
    const count = parseInt(localStorage.getItem("retryBeforeSrcReset"), 10) || DEFAULT_RETRY_BEFORE_SRC_RESET;
    return Math.max(0, count);
}

// =====================================================
// Profile Management
// =====================================================
const PROFILES_KEY = "profiles";
const CURRENT_PROFILE_KEY = "currentProfile";
const DEFAULT_PROFILE_NAME = "Default";

// Get all profiles
function getProfiles() {
    const profiles = localStorage.getItem(PROFILES_KEY);
    if (profiles) {
        try {
            return JSON.parse(profiles);
        } catch (e) {
            return { [DEFAULT_PROFILE_NAME]: {} };
        }
    }
    return { [DEFAULT_PROFILE_NAME]: {} };
}

// Save all profiles
function saveProfiles(profiles) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

// Get current profile name
function getCurrentProfileName() {
    return localStorage.getItem(CURRENT_PROFILE_KEY) || DEFAULT_PROFILE_NAME;
}

// Set current profile name
function setCurrentProfileName(name) {
    localStorage.setItem(CURRENT_PROFILE_KEY, name);
}

// Get settings keys that should be saved in profile
function getProfileSettingsKeys() {
    return [
        "language",
        "startupView",
        "subtitleInMediaSession",
        "autoLoadSubtitle",
        "autoHidePanel",
        "autoResizeWindow",
        "disableRotateBtn",
        "playbackSpeed",
        "preservePitch",
        "speedStep",
        "speedAudioOnly",
        "shortcutSpeedEnabled",
        "shortcutLoopEnabled",
        "videoPreviewEnabled",
        "corsBypassUrl",
        "corsBypassEnabled",
        "networkRetryCount",
        "iptvSourceRetryCount",
        "retryDelay",
        "retryBeforeSrcReset",
        "defaultPlaylist"
    ];
}

// Export current profile data
function exportCurrentProfileData() {
    const profileData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: {},
        playlists: null,
        customIptvChannels: null
    };

    // Save settings
    const keys = getProfileSettingsKeys();
    for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value !== null) {
            profileData.settings[key] = value;
        }
    }

    return profileData;
}

// Create default profile data (for new profiles)
function createDefaultProfileData() {
    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: {
            language: "en",
            startupView: "player",
            subtitleInMediaSession: "true",
            autoLoadSubtitle: "true",
            autoHidePanel: "false",
            autoResizeWindow: "false",
            disableRotateBtn: "false",
            playbackSpeed: "1",
            preservePitch: "false",
            speedStep: "0.05",
            speedAudioOnly: "false",
            shortcutSpeedEnabled: "true",
            shortcutLoopEnabled: "true",
            videoPreviewEnabled: "true",
            corsBypassUrl: "",
            corsBypassEnabled: "false",
            networkRetryCount: DEFAULT_NETWORK_RETRY_COUNT.toString(),
            iptvSourceRetryCount: DEFAULT_IPTV_SOURCE_RETRY_COUNT.toString(),
            retryDelay: DEFAULT_RETRY_DELAY.toString(),
            retryBeforeSrcReset: DEFAULT_RETRY_BEFORE_SRC_RESET.toString()
        },
        playlists: { "Default": [] },
        customIptvChannels: []
    };
}

// Import profile data (async to get playlists and IPTV channels)
async function importProfileData(profileData) {
    // Load playlists from IndexedDB
    try {
        const playlists = await playlists_load();
        profileData.playlists = playlists;
    } catch (e) {
        profileData.playlists = {};
    }

    // Load custom IPTV channels from IndexedDB
    try {
        const channels = await kv_get("customIptvChannels");
        profileData.customIptvChannels = channels || [];
    } catch (e) {
        profileData.customIptvChannels = [];
    }

    return profileData;
}

// Apply profile data to current session
async function applyProfileData(profileData) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    // Apply settings
    if (profileData.settings) {
        for (const [key, value] of Object.entries(profileData.settings)) {
            localStorage.setItem(key, value);
        }
    }

    // Apply playlists
    if (profileData.playlists) {
        await playlists_save(profileData.playlists);
        if (typeof playlist_renderTree === 'function') playlist_renderTree();
    }

    // Apply custom IPTV channels
    if (profileData.customIptvChannels !== undefined) {
        await kv_set("customIptvChannels", profileData.customIptvChannels);
        if (typeof renderIPTVList === 'function') renderIPTVList();
    }

    // Refresh UI
    if (typeof initPlaybackSpeed === 'function') initPlaybackSpeed();
    if (typeof applyPlaybackSpeed === 'function') applyPlaybackSpeed();
    if (typeof applyStartupView === 'function') applyStartupView();
    if (typeof loadPlayMode === 'function') loadPlayMode();

    // Apply language setting and update UI
    const savedLang = localStorage.getItem("language") || "en";
    if (window.i18n && typeof window.i18n.setLanguage === 'function') {
        window.i18n.setLanguage(savedLang);
    }

    // Reload settings UI elements
    const languageSelect = document.getElementById("languageSelect");
    if (languageSelect) languageSelect.value = savedLang;

    const startupViewSelect = document.getElementById("startupViewSelect");
    if (startupViewSelect) startupViewSelect.value = localStorage.getItem("startupView") || "player";

    const autoLoadSubtitle = document.getElementById("autoLoadSubtitle");
    if (autoLoadSubtitle) autoLoadSubtitle.checked = localStorage.getItem("autoLoadSubtitle") !== "false";

    const subtitleInMediaSession = document.getElementById("subtitleInMediaSession");
    if (subtitleInMediaSession) subtitleInMediaSession.checked = localStorage.getItem("subtitleInMediaSession") !== "false";

    const autoHidePanel = document.getElementById("autoHidePanel");
    if (autoHidePanel) autoHidePanel.checked = localStorage.getItem("autoHidePanel") === "true";

    const autoResizeWindow = document.getElementById("autoResizeWindow");
    if (autoResizeWindow) autoResizeWindow.checked = localStorage.getItem("autoResizeWindow") === "true";

    const disableRotateBtn = document.getElementById("disableRotateBtn");
    if (disableRotateBtn) disableRotateBtn.checked = localStorage.getItem("disableRotateBtn") === "true";

    const corsBypassUrl = document.getElementById("corsBypassUrl");
    if (corsBypassUrl) corsBypassUrl.value = localStorage.getItem("corsBypassUrl") || "";

    const corsBypassToggle = document.getElementById("corsBypassToggle");
    if (corsBypassToggle) corsBypassToggle.checked = localStorage.getItem("corsBypassEnabled") === "true";

    const networkRetryInput = document.getElementById("networkRetryCount");
    if (networkRetryInput) networkRetryInput.value = localStorage.getItem("networkRetryCount") || DEFAULT_NETWORK_RETRY_COUNT.toString();

    const iptvSourceRetryInput = document.getElementById("iptvSourceRetryCount");
    if (iptvSourceRetryInput) iptvSourceRetryInput.value = localStorage.getItem("iptvSourceRetryCount") || DEFAULT_IPTV_SOURCE_RETRY_COUNT.toString();

    const retryDelayInput = document.getElementById("retryDelay");
    if (retryDelayInput) retryDelayInput.value = localStorage.getItem("retryDelay") || DEFAULT_RETRY_DELAY.toString();

    const retryBeforeSrcResetInput = document.getElementById("retryBeforeSrcReset");
    if (retryBeforeSrcResetInput) retryBeforeSrcResetInput.value = localStorage.getItem("retryBeforeSrcReset") || DEFAULT_RETRY_BEFORE_SRC_RESET.toString();

    showToast(t('profileLoaded', 'Profile loaded'));
}

// Save current state to profile
async function saveCurrentProfile() {
    const profileName = getCurrentProfileName();
    const profiles = getProfiles();
    profiles[profileName] = await importProfileData(exportCurrentProfileData());
    saveProfiles(profiles);
}

// Update profile select dropdown
function updateProfileSelect() {
    const select = document.getElementById("profileSelect");
    if (!select) return;

    const profiles = getProfiles();
    const currentName = getCurrentProfileName();

    select.innerHTML = "";
    for (const name of Object.keys(profiles).sort()) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        if (name === currentName) option.selected = true;
        select.appendChild(option);
    }
}

// Initialize profile management
function initProfiles() {
    const select = document.getElementById("profileSelect");
    const newBtn = document.getElementById("newProfileBtn");
    const duplicateBtn = document.getElementById("duplicateProfileBtn");
    const renameBtn = document.getElementById("renameProfileBtn");
    const resetBtn = document.getElementById("resetProfileBtn");
    const deleteBtn = document.getElementById("deleteProfileBtn");
    const exportBtn = document.getElementById("exportProfileBtn");
    const importBtn = document.getElementById("importProfileBtn");
    const fileInput = document.getElementById("profileFileInput");

    if (!select) return;

    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    // Populate select
    updateProfileSelect();

    // Switch profile
    select.addEventListener("change", async () => {
        const newName = select.value;
        const profiles = getProfiles();

        // Save current profile first
        await saveCurrentProfile();

        // Load new profile
        setCurrentProfileName(newName);
        const profileData = profiles[newName];
        if (profileData && Object.keys(profileData).length > 0) {
            await applyProfileData(profileData);
        }

        updateProfileSelect();
    });

    // New profile
    if (newBtn) {
        newBtn.addEventListener("click", async () => {
            const name = prompt(t('newProfileName', 'New profile name:'));
            if (!name || !name.trim()) return;

            const profiles = getProfiles();
            if (profiles[name]) {
                alert(t('profileExists', 'Profile already exists'));
                return;
            }

            // Save current profile first
            await saveCurrentProfile();

            // Create new profile with default settings
            profiles[name] = createDefaultProfileData();
            saveProfiles(profiles);
            setCurrentProfileName(name);
            await applyProfileData(profiles[name]);
            updateProfileSelect();
            showToast(t('profileCreated', 'Profile created'));
        });
    }

    // Duplicate profile (copy current settings)
    if (duplicateBtn) {
        duplicateBtn.addEventListener("click", async () => {
            const name = prompt(t('newProfileName', 'New profile name:'));
            if (!name || !name.trim()) return;

            const profiles = getProfiles();
            if (profiles[name]) {
                alert(t('profileExists', 'Profile already exists'));
                return;
            }

            // Save current profile first
            await saveCurrentProfile();

            // Create new profile with current settings (duplicate)
            profiles[name] = await importProfileData(exportCurrentProfileData());
            saveProfiles(profiles);
            setCurrentProfileName(name);
            await applyProfileData(profiles[name]);
            updateProfileSelect();
            showToast(t('profileCreated', 'Profile created'));
        });
    }

    // Rename profile
    if (renameBtn) {
        renameBtn.addEventListener("click", () => {
            const oldName = getCurrentProfileName();
            if (oldName === DEFAULT_PROFILE_NAME) {
                alert(t('cannotRenameDefault', 'Cannot rename default profile'));
                return;
            }

            const newName = prompt(t('newProfileName', 'New profile name:'), oldName);
            if (!newName || !newName.trim() || newName === oldName) return;

            const profiles = getProfiles();
            if (profiles[newName]) {
                alert(t('profileExists', 'Profile already exists'));
                return;
            }

            profiles[newName] = profiles[oldName];
            delete profiles[oldName];
            saveProfiles(profiles);
            setCurrentProfileName(newName);
            updateProfileSelect();
            showToast(t('profileRenamed', 'Profile renamed'));
        });
    }

    // Reset profile
    if (resetBtn) {
        resetBtn.addEventListener("click", async () => {
            if (!confirm(t('confirmResetProfile', 'Reset this profile to default settings?'))) return;

            const name = getCurrentProfileName();
            const profiles = getProfiles();
            profiles[name] = createDefaultProfileData();
            saveProfiles(profiles);
            await applyProfileData(profiles[name]);
            updateProfileSelect();
            showToast(t('profileReset', 'Profile reset'));
        });
    }

    // Delete profile
    if (deleteBtn) {
        deleteBtn.addEventListener("click", () => {
            const name = getCurrentProfileName();
            if (name === DEFAULT_PROFILE_NAME) {
                alert(t('cannotDeleteDefault', 'Cannot delete default profile'));
                return;
            }

            if (!confirm(t('confirmDeleteProfile', 'Delete this profile?'))) return;

            const profiles = getProfiles();
            delete profiles[name];
            saveProfiles(profiles);
            setCurrentProfileName(DEFAULT_PROFILE_NAME);
            updateProfileSelect();
            showToast(t('profileDeleted', 'Profile deleted'));
        });
    }

    // Export profile
    if (exportBtn) {
        exportBtn.addEventListener("click", async () => {
            const profileData = await importProfileData(exportCurrentProfileData());
            profileData.profileName = getCurrentProfileName();

            const json = JSON.stringify(profileData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `pwa-player-profile-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    // Import profile
    if (importBtn && fileInput) {
        importBtn.addEventListener("click", () => fileInput.click());

        fileInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const profileData = JSON.parse(text);

                if (!profileData.version || !profileData.settings) {
                    alert(t('invalidProfile', 'Invalid profile file'));
                    return;
                }

                // Ask for profile name
                const defaultName = profileData.profileName || t('importedProfile', 'Imported');
                const name = prompt(t('newProfileName', 'New profile name:'), defaultName);
                if (!name || !name.trim()) return;

                const profiles = getProfiles();
                profiles[name] = profileData;
                saveProfiles(profiles);

                // Ask if user wants to switch to imported profile
                if (confirm(t('switchToImportedProfile', 'Switch to imported profile?'))) {
                    setCurrentProfileName(name);
                    await applyProfileData(profileData);
                }

                updateProfileSelect();
            } catch (err) {
                alert(t('importFailed', 'Failed to import: ') + err.message);
            }

            fileInput.value = '';
        });
    }
}

// Initialize on load
initProfiles();
