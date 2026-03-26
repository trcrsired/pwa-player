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
