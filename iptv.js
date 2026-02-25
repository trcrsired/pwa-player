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

        // Skip NSFW channels unless unlocked
        const isUnlocked = localStorage.hiddenfeatures === "true";
        if (channel.nsfw && !isUnlocked) {
            return;
        }

        const li = document.createElement("li");
        li.className = "list-item";

        const row = document.createElement("div");
        row.className = "iptv-row";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = channel.name;
        nameSpan.className = "iptv-name";

        // 🔥 Add NSFW badge only when unlocked
        if (channel.nsfw && isUnlocked) {
            const badge = document.createElement("span");
            badge.textContent = "NSFW";
            badge.className = "iptv-nsfw-badge";
            nameSpan.appendChild(badge);
        }

        nameSpan.addEventListener("click", () => {
            const url = channel.url || (channel.urls && channel.urls[0]);
            if (!url) return;

            play_source_title(url, channel.name, null);
            iptvView.classList.add("hidden");
            playerContainer.classList.remove("hidden");
        });

        row.appendChild(nameSpan);

        const expandBtn = document.createElement("button");
        expandBtn.className = "iptv-expand-btn";

        const urlList = channel.url ? [channel.url] : channel.urls;

        expandBtn.textContent = urlList.length > 1
            ? `+ (${urlList.length})`
            : "+";

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
