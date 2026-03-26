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

// Context menu for IPTV channels (on + button)
function showIPTVChannelMenu(channel, url, x, y) {
    const existing = document.querySelector(".context-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.style.position = "fixed";

    menu.innerHTML = `
        <div class="menu-item" data-action="add">${window.i18n ? window.i18n.t('addToPlaylist') : 'Add to Playlist'}</div>
        <div class="menu-item" data-action="close">${window.i18n ? window.i18n.t('close') : 'Close'}</div>
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
                    window.i18n ? window.i18n.t('whichPlaylist') : "Add to which playlist?\n" +
                    names.map((n, i) => `${i + 1}. ${n}`).join("\n"),
                    "1"
                );

                if (!choice) {
                    closeMenu();
                    return;
                }

                const index = parseInt(choice, 10) - 1;
                if (index < 0 || index >= names.length) {
                    alert(window.i18n ? window.i18n.t('invalidSelection') : "Invalid selection");
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
        li.className = "iptv-node";

        const header = document.createElement("div");
        header.className = "iptv-header";

        const urlList = channel.url ? [channel.url] : channel.urls;

        // Expand button (+) - on the left, no background
        const expandBtn = document.createElement("button");
        expandBtn.className = "iptv-toggle";

        // Build the toggle content
        const toggleText = document.createElement("span");
        toggleText.className = "iptv-toggle-text";
        toggleText.textContent = "+";

        if (urlList.length > 1) {
            const countBadge = document.createElement("span");
            countBadge.className = "iptv-count-badge";
            countBadge.textContent = `(${urlList.length})`;
            expandBtn.appendChild(toggleText);
            expandBtn.appendChild(countBadge);
        } else {
            expandBtn.textContent = "+";
        }

        const nameSpan = document.createElement("span");
        nameSpan.className = "iptv-name";
        nameSpan.textContent = channel.name;

        // Add NSFW badge only when unlocked
        if (channel.nsfw && isUnlocked) {
            const badge = document.createElement("span");
            badge.textContent = "NSFW";
            badge.className = "iptv-nsfw-badge";
            nameSpan.appendChild(badge);
        }

        const primaryUrl = channel.url || (channel.urls && channel.urls[0]);

        // Click on name plays the channel
        nameSpan.addEventListener("click", () => {
            if (!primaryUrl) return;
            play_source_title(primaryUrl, channel.name, null);
            closeActiveView();
        });

        const subList = document.createElement("ul");
        subList.className = "iptv-sub hidden";

        urlList.forEach(url => {
            const subLi = document.createElement("li");
            subLi.className = "iptv-subitem";

            // Add button for this URL
            const addBtn = document.createElement("button");
            addBtn.className = "iptv-sub-toggle";
            addBtn.textContent = "+";
            addBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                showIPTVChannelMenu(channel, url, e.clientX, e.clientY);
            });
            addBtn.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                e.stopPropagation();
                showIPTVChannelMenu(channel, url, e.clientX, e.clientY);
            });
            subLi.appendChild(addBtn);

            const urlSpan = document.createElement("span");
            urlSpan.className = "iptv-url-text";
            urlSpan.textContent = url;

            // Click on URL plays it
            urlSpan.addEventListener("click", () => {
                play_source_title(url, channel.name, null);
                closeActiveView();
            });

            subLi.appendChild(urlSpan);

            subList.appendChild(subLi);
        });

        // Click on + expands/collapses
        expandBtn.addEventListener("click", () => {
            const hidden = subList.classList.toggle("hidden");
            if (urlList.length > 1) {
                expandBtn.querySelector(".iptv-toggle-text").textContent = hidden ? "+" : "−";
            } else {
                expandBtn.textContent = hidden ? "+" : "−";
            }
        });

        // Right-click on + shows menu
        expandBtn.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (primaryUrl) {
                showIPTVChannelMenu(channel, primaryUrl, e.clientX, e.clientY);
            }
        });

        header.appendChild(expandBtn);
        header.appendChild(nameSpan);
        li.appendChild(header);
        li.appendChild(subList);
        iptvList.appendChild(li);
    });
}
