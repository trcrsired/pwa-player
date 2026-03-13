// Auto-fill current year
const settingsYearEl = document.getElementById("settingsYear");
settingsYearEl.textContent = `2025–${new Date().getFullYear()}`;

let settingsClickCount = 0;
let settingsClickTimer = null;

settingsYearEl.addEventListener("click", () => {
    ++settingsClickCount;

    // Reset if user waits too long
    if (settingsClickTimer) clearTimeout(settingsClickTimer);
    settingsClickTimer = setTimeout(() => {
        settingsClickCount = 0;
    }, 1500);

    if (settingsClickCount >= 5) {
        settingsClickCount = 0;

        const enabled = localStorage.getItem("hiddenfeatures") === "true";

        if (enabled) {
            localStorage.removeItem("hiddenfeatures");
        } else {
            localStorage.setItem("hiddenfeatures", "true");
        }
    }
});

document.getElementById("settingsBtn").addEventListener("click", () => {
    switchView("settingsView");
});

document.getElementById("settingsCloseBtn").addEventListener("click", () => {
    closeActiveView();
});
