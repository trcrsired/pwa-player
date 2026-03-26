import { iptvChannels } from "/iptvchannels.js";

// Elements
const iptvBtn = document.getElementById("iptvBtn");
const iptvBackBtn = document.getElementById("iptvBackBtn");
const iptvList = document.getElementById("iptvList");
const iptvSearch = document.getElementById("iptvSearch");

// Open IPTV menu
iptvBtn.addEventListener("click", () => {
    iptvSearch.value = "";
    renderIPTVList();
    switchView("iptvView");
});

// Back button
iptvBackBtn.addEventListener("click", () => {
    closeActiveView();
});

// Search input
iptvSearch.addEventListener("input", () => {
    renderIPTVList(iptvSearch.value.trim().toLowerCase());
});

// Context menu for IPTV channels
function showIPTVChannelMenu(channel, url, x, y) {
    const existing = document.querySelector(".context-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.style.position = "fixed";

    menu.innerHTML = `
        <div class="menu-item" data-action="add">Add to Playlist</div>
        <div class="menu-item" data-action="close">Close</div>
    `;

    document.body.appendChild(menu);

    const closeMenu = () => menu.remove();

    setTimeout(() => {
        document.addEventListener("mousedown", (e) => {
            if (!menu.contains(e.target)) closeMenu();
        }, { once: true });
    }, 0);

    menu.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", async () => {
            const action = item.dataset.action;

            if (action === "add") {
                const playlists = await playlists_load();
                const names = Object.keys(playlists);

                const choice = prompt(
                    "Add to which playlist?\n" +
                    names.map((n, i) => `${i + 1}. ${n}`).join("\n"),
                    "1"
                );

                if (!choice) {
                    closeMenu();
                    return;
                }

                const index = parseInt(choice, 10) - 1;
                if (index < 0 || index >= names.length) {
                    alert("Invalid selection");
                    closeMenu();
                    return;
                }

                const selectedName = names[index];

                playlists[selectedName].push({
                    name: channel.name,
                    path: url
                });
                await playlists_save(playlists);
                alert(`Added "${channel.name}" to playlist "${selectedName}".`);
            }

            closeMenu();
        });
    });
}

// Render IPTV channels
function renderIPTVList(searchFilter = "") {
    iptvList.innerHTML = "";

    iptvChannels.forEach(channel => {

        // Skip NSFW channels unless unlocked
        const isUnlocked = localStorage.getItem("hiddenfeatures") === "true";
        if (channel.nsfw && !isUnlocked) {
            return;
        }

        // Filter by search
        if (searchFilter && !channel.name.toLowerCase().includes(searchFilter)) {
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

        const primaryUrl = channel.url || (channel.urls && channel.urls[0]);

        // Click on name shows menu
        nameSpan.addEventListener("click", (e) => {
            if (!primaryUrl) return;
            showIPTVChannelMenu(channel, primaryUrl, e.clientX, e.clientY);
        });

        row.appendChild(nameSpan);

        // Play button
        const playBtn = document.createElement("button");
        playBtn.className = "iptv-play-btn";
        playBtn.textContent = "▶";
        playBtn.addEventListener("click", () => {
            if (!primaryUrl) return;
            play_source_title(primaryUrl, channel.name, null);
            closeActiveView();
        });
        row.appendChild(playBtn);

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

            const urlSpan = document.createElement("span");
            urlSpan.className = "iptv-url-text";
            urlSpan.textContent = url;

            // Click on URL shows menu
            urlSpan.addEventListener("click", (e) => {
                showIPTVChannelMenu(channel, url, e.clientX, e.clientY);
            });

            subLi.appendChild(urlSpan);

            // Play button for this URL
            const subPlayBtn = document.createElement("button");
            subPlayBtn.className = "iptv-play-btn";
            subPlayBtn.textContent = "▶";
            subPlayBtn.addEventListener("click", () => {
                play_source_title(url, channel.name, null);
                closeActiveView();
            });
            subLi.appendChild(subPlayBtn);

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
