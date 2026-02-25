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

        const row = document.createElement("div");
        row.className = "iptv-row";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = channel.name;
        nameSpan.className = "iptv-name";

        // Main click → play first URL
        nameSpan.addEventListener("click", () => {
            const url = channel.url || (channel.urls && channel.urls[0]);
            if (!url) return;

            play_source_title(url, channel.name, null);
            iptvView.classList.add("hidden");
            playerContainer.classList.remove("hidden");
        });

        row.appendChild(nameSpan);

        // Always create expand button
        const expandBtn = document.createElement("button");
        expandBtn.className = "iptv-expand-btn";

        // Normalize URLs into an array
        const urlList = channel.url ? [channel.url] : channel.urls;

        // Show count only if > 1
        if (urlList.length > 1) {
            expandBtn.textContent = `+ (${urlList.length})`;
        } else {
            expandBtn.textContent = "+";
        }

        const subList = document.createElement("ul");
        subList.className = "iptv-sublist hidden";

        urlList.forEach(url => {
            const subLi = document.createElement("li");
            subLi.className = "iptv-subitem";
            subLi.textContent = url;

            subLi.addEventListener("click", () => {
                play_source_title(url, channel.name, null);
                iptvView.classList.add("hidden");
                playerContainer.classList.remove("hidden");
            });

            subList.appendChild(subLi);
        });

        expandBtn.addEventListener("click", () => {
            subList.classList.toggle("hidden");
        });

        row.appendChild(expandBtn);
        li.appendChild(row);
        li.appendChild(subList);
        iptvList.appendChild(li);
    });
}
