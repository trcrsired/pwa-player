import { iptvChannels } from "/iptvchannels.js";

// Elements
const iptvBtn = document.getElementById("iptvBtn");
const iptvView = document.getElementById("iptvView");
const iptvBackBtn = document.getElementById("iptvBackBtn");
const iptvList = document.getElementById("iptvList");
const playerContainer = document.getElementById("playerContainer");

// Open IPTV menu
iptvBtn.addEventListener("click", () => {
    renderIPTVList();
    iptvView.classList.remove("hidden");
    playerContainer.classList.add("hidden");
});

// Back button
iptvBackBtn.addEventListener("click", () => {
    iptvView.classList.add("hidden");
    playerContainer.classList.remove("hidden");
});

// Render IPTV channels
function renderIPTVList() {
    iptvList.innerHTML = "";

    iptvChannels.forEach(channel => {
        const li = document.createElement("li");
        li.className = "list-item";

        // Main row container
        const row = document.createElement("div");
        row.className = "iptv-row";

        // Channel name (click → play first URL)
        const nameSpan = document.createElement("span");
        nameSpan.textContent = channel.name;
        nameSpan.className = "iptv-name";

        nameSpan.addEventListener("click", () => {
            play_source(channel.urls[0]);
            iptvView.classList.add("hidden");
            playerContainer.classList.remove("hidden");
        });

        // "+" button to expand sources
        const expandBtn = document.createElement("button");
        expandBtn.textContent = "+";
        expandBtn.className = "iptv-expand-btn";

        // Sub-list for multiple URLs
        const subList = document.createElement("ul");
        subList.className = "iptv-sublist hidden";

        channel.urls.forEach(url => {
            const subLi = document.createElement("li");
            subLi.className = "iptv-subitem";
            subLi.textContent = url;

            subLi.addEventListener("click", () => {
                play_source(url);
                iptvView.classList.add("hidden");
                playerContainer.classList.remove("hidden");
            });

            subList.appendChild(subLi);
        });

        expandBtn.addEventListener("click", () => {
            subList.classList.toggle("hidden");
        });

        row.appendChild(nameSpan);
        row.appendChild(expandBtn);

        li.appendChild(row);
        li.appendChild(subList);

        iptvList.appendChild(li);
    });
}
