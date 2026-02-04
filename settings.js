// Auto-fill current year
document.getElementById("settingsYear").textContent = 
    `2025–${new Date().getFullYear()}`;

document.getElementById("settingsBtn").addEventListener("click", () => {
    document.getElementById("playerContainer").classList.add("hidden");
    document.getElementById("settingsView").classList.remove("hidden");
});

document.getElementById("settingsCloseBtn").addEventListener("click", () => {
    document.getElementById("settingsView").classList.add("hidden");
    document.getElementById("playerContainer").classList.remove("hidden");
});
