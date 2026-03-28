const settingsYearEl = document.getElementById("settingsYear");
settingsYearEl.textContent = `2025–${new Date().getFullYear()}`;

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

// Startup view selection
const startupViewSelect = document.getElementById("startupViewSelect");

// Load saved preference (default: player)
startupViewSelect.value = localStorage.getItem("startupView") || "player";

startupViewSelect.addEventListener("change", () => {
    localStorage.setItem("startupView", startupViewSelect.value);
});
