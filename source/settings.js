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

// Default speed is 1.0
const DEFAULT_PLAYBACK_SPEED = 1.0;
const SPEED_STEP = 0.05;

// Get current playback speed
function getPlaybackSpeed() {
    const speed = parseFloat(localStorage.getItem("playbackSpeed")) || DEFAULT_PLAYBACK_SPEED;
    return Math.max(0.1, Math.min(16, speed));
}

// Get preserve pitch setting (default: false - pitch changes with speed)
function getPreservePitch() {
    return localStorage.getItem("preservePitch") === "true";
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
    setPlaybackSpeed(currentSpeed - SPEED_STEP);
});

speedUp.addEventListener("click", () => {
    const currentSpeed = getPlaybackSpeed();
    setPlaybackSpeed(currentSpeed + SPEED_STEP);
});

speedReset.addEventListener("click", () => {
    setPlaybackSpeed(DEFAULT_PLAYBACK_SPEED);
});

preservePitchCheckbox.addEventListener("change", () => {
    localStorage.setItem("preservePitch", preservePitchCheckbox.checked ? "true" : "false");
    applyPlaybackSpeed();
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
