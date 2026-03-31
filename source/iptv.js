import { iptvChannels } from "/iptvchannels.js";

// Elements
const iptvBtn = document.getElementById("iptvBtn");
const iptvBackBtn = document.getElementById("iptvBackBtn");
const iptvList = document.getElementById("iptvList");
const iptvSearch = document.getElementById("iptvSearch");

// Custom IPTV channels storage key
const CUSTOM_IPTV_KEY = "customIptvChannels";

// Load custom IPTV channels from storage
async function loadCustomIptvChannels() {
    try {
        const channels = await kv_get(CUSTOM_IPTV_KEY);
        return Array.isArray(channels) ? channels : [];
    } catch (e) {
        console.warn("Failed to load custom IPTV channels:", e);
        return [];
    }
}

// Save custom IPTV channels to storage
async function saveCustomIptvChannels(channels) {
    try {
        await kv_set(CUSTOM_IPTV_KEY, channels);
    } catch (e) {
        console.warn("Failed to save custom IPTV channels:", e);
    }
}

// Export custom channels to JSON file
async function exportCustomChannels() {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    const customChannels = await loadCustomIptvChannels();
    if (customChannels.length === 0) {
        alert(t('noCustomChannels', 'No custom channels to export'));
        return;
    }

    const json = JSON.stringify(customChannels, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `iptv-channels-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
}

// Import custom channels from JSON file
function importCustomChannels() {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const channels = JSON.parse(text);

            if (!Array.isArray(channels)) {
                alert(t('invalidFormat', 'Invalid format: expected an array of channels'));
                return;
            }

            // Validate channel structure
            for (const ch of channels) {
                if (!ch.name || (!ch.url && !ch.urls)) {
                    alert(t('invalidChannel', 'Invalid channel: each channel needs name and url/urls'));
                    return;
                }
            }

            // Normalize cors flag to boolean
            for (const ch of channels) {
                if (ch.cors !== undefined) {
                    ch.cors = !!ch.cors;
                }
            }

            // Merge with existing channels
            const existing = await loadCustomIptvChannels();
            const merged = [...existing, ...channels];
            await saveCustomIptvChannels(merged);

            alert(t('importSuccess', { count: channels.length }));
            renderIPTVList();
        } catch (err) {
            alert(t('importFailed', 'Failed to import: ') + err.message);
        }
    };

    input.click();
}

// Clear all custom channels
async function clearCustomChannels() {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    if (!confirm(t('confirmClearChannels', 'Delete all custom channels?'))) return;

    await saveCustomIptvChannels([]);
    renderIPTVList();
}

// Open IPTV menu
iptvBtn.addEventListener("click", () => {
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

// Import/Export/Clear buttons
document.getElementById("iptvImportBtn")?.addEventListener("click", importCustomChannels);
document.getElementById("iptvExportBtn")?.addEventListener("click", exportCustomChannels);
document.getElementById("iptvClearBtn")?.addEventListener("click", clearCustomChannels);

// Context menu for IPTV channels (on + button)
function showIPTVChannelMenu(channel, url, button) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    const menu = document.createElement("div");
    menu.className = "context-menu";

    const corsBypassUrl = localStorage.getItem("corsBypassUrl") || "";
    const corsEnabled = localStorage.getItem("corsBypassEnabled") === "true";

    // Build menu items - default play uses the toggle setting
    const items = [
        { action: "play", label: t('playThis', 'Play'), cors: corsEnabled, close: true },
        { action: "play-keep-open", label: t('playKeepPanel', 'Play (keep panel open)'), cors: corsEnabled, close: false }
    ];

    // Add CORS override options only if bypass server is configured
    if (corsBypassUrl) {
        const corsOverride = !corsEnabled;
        const corsLabel = corsEnabled ? t('playWithoutCors', 'Play without CORS') : t('playWithCors', 'Play with CORS');
        const corsKeepOpenLabel = corsEnabled ? t('playWithoutCorsKeepOpen', 'Play without CORS (keep open)') : t('playWithCorsKeepOpen', 'Play with CORS (keep open)');

        items.push(
            { action: "play-cors", label: corsLabel, cors: corsOverride, close: true },
            { action: "play-cors-keep-open", label: corsKeepOpenLabel, cors: corsOverride, close: false }
        );
    }

    items.push(
        { action: "add", label: t('addToPlaylist', 'Add to Playlist'), cors: corsEnabled },
        { action: "add-no-cors", label: corsEnabled ? t('addToPlaylistNoCors', 'Add to Playlist (no CORS)') : t('addToPlaylistWithCors', 'Add to Playlist (with CORS)'), cors: !corsEnabled },
        { action: "copy-url", label: t('copyUrl', 'Copy URL') },
        { action: "close", label: t('close', 'Close') }
    );

    menu.innerHTML = items.map(item => `<div class="menu-item" data-action="${item.action}">${item.label}</div>`).join("");

    if (!positionMenu(menu, button)) return;

    const closeMenu = () => menu.remove();

    menu.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", async () => {
            const action = item.dataset.action;
            const menuItem = items.find(i => i.action === action);

            if (menuItem && action.startsWith("play")) {
                play_source_title(url, channel.name, null, menuItem.cors);
                if (menuItem.close) closeActiveView();
                closeMenu();
                return;
            }

            if (action.startsWith("add")) {
                const playlists = await playlists_load();
                const names = Object.keys(playlists);

                const choice = prompt(
                    t('whichPlaylist') + "\n" +
                    names.map((n, i) => `${i + 1}. ${n}`).join("\n"),
                    "1"
                );

                if (!choice) {
                    closeMenu();
                    return;
                }

                const index = parseInt(choice, 10) - 1;
                if (index < 0 || index >= names.length) {
                    alert(t('invalidSelection'));
                    closeMenu();
                    return;
                }

                playlists[names[index]].push({
                    name: channel.name,
                    path: url,
                    corsBypass: menuItem.cors
                });
                await playlists_save(playlists);
                playlist_renderTree();
                alert(`${t('addedToPlaylistSuccess', 'Added')} "${channel.name}" ${t('toPlaylist', 'to playlist')} "${names[index]}".`);
            }

            if (action === "copy-url") {
                try {
                    await navigator.clipboard.writeText(url);
                    const toast = document.getElementById("toast");
                    if (toast) {
                        toast.textContent = t('urlCopied', 'URL copied to clipboard');
                        toast.classList.add("show");
                        setTimeout(() => toast.classList.remove("show"), 2000);
                    }
                } catch (err) {
                    console.warn("Failed to copy URL:", err);
                }
            }

            closeMenu();
        });
    });
}

// Check if URL is an IP address (local network)
function isIpAddressUrl(url) {
    try {
        const u = new URL(url);
        const host = u.hostname;
        // Check for IP patterns (local network, loopback, etc.)
        return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || /^\[?[0-9a-f:]+\]?$/i.test(host);
    } catch {
        return false;
    }
}

// Check if URL is HTTP (not HTTPS)
function isHttpUrl(url) {
    return url && url.startsWith('http://');
}

// Render IPTV channels
async function renderIPTVList(searchFilter = "") {
    iptvList.innerHTML = "";

    // Count rendered channels
    let renderedCount = 0;

    // Load and render custom channels
    const customChannels = await loadCustomIptvChannels();
    customChannels.forEach((channel, index) => {
        if (renderChannel(channel, searchFilter, true, index)) {
            renderedCount++;
        }
    });

    // Render predefined channels
    iptvChannels.forEach(channel => {
        if (renderChannel(channel, searchFilter, false, -1)) {
            renderedCount++;
        }
    });

    // Update count display
    const countSpan = document.getElementById("iptvChannelCount");
    if (countSpan) countSpan.textContent = renderedCount;
}

// Render a single channel
function renderChannel(channel, searchFilter, isCustom, customIndex) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    // Skip NSFW channels unless unlocked
    const isUnlocked = localStorage.getItem("hiddenfeatures") === "true";
    if (channel.nsfw && !isUnlocked) {
        return false;
    }

    // Filter by search
    if (searchFilter && !channel.name.toLowerCase().includes(searchFilter)) {
        return false;
    }

    const li = document.createElement("li");
    li.className = "iptv-node";
    if (isCustom) {
        li.style.borderLeft = "3px solid #4caf50";
    }

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

    // Custom badge
    if (isCustom) {
        const customBadge = document.createElement("span");
        customBadge.textContent = "CUSTOM";
        customBadge.className = "iptv-badge";
        customBadge.style.cssText = "background:#4caf50;color:#fff;margin-left:6px;padding:2px 6px;border-radius:4px;font-size:10px;";
        nameSpan.appendChild(customBadge);
    }

    const primaryUrl = channel.url || (channel.urls && channel.urls[0]);

    // Add badges for URL characteristics
    if (primaryUrl) {
        // NSFW badge (only when unlocked)
        if (channel.nsfw && isUnlocked) {
            const badge = document.createElement("span");
            badge.textContent = "NSFW";
            badge.className = "iptv-badge iptv-nsfw-badge";
            nameSpan.appendChild(badge);
        }

        // CORS badge (channel marked as always needing CORS)
        if (channel.cors) {
            const badge = document.createElement("span");
            badge.textContent = "CORS";
            badge.className = "iptv-badge iptv-http-badge";
            badge.title = "Always uses CORS bypass";
            nameSpan.appendChild(badge);
        }
        // IP address badge (needs CORS bypass)
        else if (isIpAddressUrl(primaryUrl)) {
            const badge = document.createElement("span");
            badge.textContent = "IP";
            badge.className = "iptv-badge iptv-ip-badge";
            badge.title = "IP address - may need CORS bypass server";
            nameSpan.appendChild(badge);
        } else if (isHttpUrl(primaryUrl)) {
            // HTTP badge (may need CORS)
            const badge = document.createElement("span");
            badge.textContent = "HTTP";
            badge.className = "iptv-badge iptv-http-badge";
            badge.title = "HTTP - may require CORS bypass";
            nameSpan.appendChild(badge);
        }
    }

    // Menu button (⋮)
    const menuBtn = document.createElement("button");
    menuBtn.className = "iptv-menu";
    menuBtn.textContent = "⋮";
    menuBtn.title = "Menu";
    menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isCustom) {
            showCustomChannelMenu(channel, primaryUrl, e.currentTarget, customIndex);
        } else if (primaryUrl) {
            showIPTVChannelMenu(channel, primaryUrl, e.currentTarget);
        }
    });

    // Click on name plays the channel (with fallback to other URLs if multiple)
    nameSpan.addEventListener("click", () => {
        if (!primaryUrl) return;
        const corsEnabled = localStorage.getItem("corsBypassEnabled") === "true";

        // If multiple URLs, use fallback logic
        if (urlList.length > 1 && typeof play_iptv_with_fallback === 'function') {
            play_iptv_with_fallback(urlList, channel.name, corsEnabled);
        } else {
            play_source_title(primaryUrl, channel.name, null, corsEnabled);
        }

        if (typeof isAutoHidePanelEnabled === 'function' && isAutoHidePanelEnabled()) {
            closeActiveView();
        }
    });

    const subList = document.createElement("ul");
    subList.className = "iptv-sub hidden";

    urlList.forEach(url => {
        const subLi = document.createElement("li");
        subLi.className = "iptv-subitem";

        const urlSpan = document.createElement("span");
        urlSpan.className = "iptv-url-text";
        urlSpan.textContent = url;

        // Add small badges for sub-URLs too
        if (isIpAddressUrl(url)) {
            const badge = document.createElement("span");
            badge.textContent = "IP";
            badge.className = "iptv-badge iptv-ip-badge";
            urlSpan.appendChild(badge);
        } else if (isHttpUrl(url)) {
            const badge = document.createElement("span");
            badge.textContent = "HTTP";
            badge.className = "iptv-badge iptv-http-badge";
            urlSpan.appendChild(badge);
        }

        // Click on URL plays it
        urlSpan.addEventListener("click", () => {
            const corsEnabled = localStorage.getItem("corsBypassEnabled") === "true";
            play_source_title(url, channel.name, null, corsEnabled);
            if (typeof isAutoHidePanelEnabled === 'function' && isAutoHidePanelEnabled()) {
                closeActiveView();
            }
        });

        // Menu button for this URL
        const addBtn = document.createElement("button");
        addBtn.className = "iptv-sub-menu";
        addBtn.textContent = "⋮";
        addBtn.title = "Menu";
        addBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isCustom) {
                showCustomChannelMenu(channel, url, e.currentTarget, customIndex);
            } else {
                showIPTVChannelMenu(channel, url, e.currentTarget);
            }
        });

        subLi.appendChild(urlSpan);
        subLi.appendChild(addBtn);

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

    header.appendChild(expandBtn);
    header.appendChild(nameSpan);
    header.appendChild(menuBtn);
    li.appendChild(header);
    li.appendChild(subList);
    iptvList.appendChild(li);
    return true;
}

// Menu for custom channels (with delete option)
function showCustomChannelMenu(channel, url, button, customIndex) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    const menu = document.createElement("div");
    menu.className = "context-menu";

    const corsBypassUrl = localStorage.getItem("corsBypassUrl") || "";
    const corsEnabled = localStorage.getItem("corsBypassEnabled") === "true";

    // Build menu items - same as predefined channels but with rename/delete
    const items = [
        { action: "play", label: t('playThis', 'Play'), cors: corsEnabled, close: true },
        { action: "play-keep-open", label: t('playKeepPanel', 'Play (keep panel open)'), cors: corsEnabled, close: false }
    ];

    // Add CORS override options only if bypass server is configured
    if (corsBypassUrl) {
        const corsOverride = !corsEnabled;
        const corsLabel = corsEnabled ? t('playWithoutCors', 'Play without CORS') : t('playWithCors', 'Play with CORS');
        const corsKeepOpenLabel = corsEnabled ? t('playWithoutCorsKeepOpen', 'Play without CORS (keep open)') : t('playWithCorsKeepOpen', 'Play with CORS (keep open)');

        items.push(
            { action: "play-cors", label: corsLabel, cors: corsOverride, close: true },
            { action: "play-cors-keep-open", label: corsKeepOpenLabel, cors: corsOverride, close: false }
        );
    }

    items.push(
        { action: "add", label: t('addToPlaylist', 'Add to Playlist'), cors: corsEnabled },
        { action: "add-no-cors", label: corsEnabled ? t('addToPlaylistNoCors', 'Add to Playlist (no CORS)') : t('addToPlaylistWithCors', 'Add to Playlist (with CORS)'), cors: !corsEnabled },
        { action: "copy-url", label: t('copyUrl', 'Copy URL') },
        { action: "rename", label: t('rename', 'Rename') },
        { action: "delete", label: t('deleteChannel', 'Delete Channel'), close: true },
        { action: "close", label: t('close', 'Close') }
    );

    menu.innerHTML = items.map(item => `<div class="menu-item" data-action="${item.action}">${item.label}</div>`).join("");

    if (!positionMenu(menu, button)) return;

    const closeMenu = () => menu.remove();

    menu.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", async () => {
            const action = item.dataset.action;
            const menuItem = items.find(i => i.action === action);

            if (menuItem && action.startsWith("play")) {
                play_source_title(url, channel.name, null, menuItem.cors);
                if (menuItem.close) closeActiveView();
                closeMenu();
                return;
            }

            if (action.startsWith("add")) {
                const playlists = await playlists_load();
                const names = Object.keys(playlists);

                const choice = prompt(
                    t('whichPlaylist', 'Add to which playlist?') + "\n" +
                    names.map((n, i) => `${i + 1}. ${n}`).join("\n"),
                    "1"
                );

                if (!choice) {
                    closeMenu();
                    return;
                }

                const index = parseInt(choice, 10) - 1;
                if (index < 0 || index >= names.length) {
                    alert(t('invalidSelection', 'Invalid selection'));
                    closeMenu();
                    return;
                }

                playlists[names[index]].push({
                    name: channel.name,
                    path: url,
                    corsBypass: menuItem.cors
                });
                await playlists_save(playlists);
                playlist_renderTree();
                alert(`${t('addedToPlaylistSuccess', 'Added')} "${channel.name}" ${t('toPlaylist', 'to playlist')} "${names[index]}".`);
            }

            if (action === "copy-url") {
                try {
                    await navigator.clipboard.writeText(url);
                    const toast = document.getElementById("toast");
                    if (toast) {
                        toast.textContent = t('urlCopied', 'URL copied to clipboard');
                        toast.classList.add("show");
                        setTimeout(() => toast.classList.remove("show"), 2000);
                    }
                } catch (err) {
                    console.warn("Failed to copy URL:", err);
                }
            }

            if (action === "rename") {
                const newName = prompt(t('newChannelName', 'New channel name:'), channel.name);
                if (newName && newName.trim()) {
                    let customChannels = await loadCustomIptvChannels();
                    customChannels[customIndex].name = newName.trim();
                    await saveCustomIptvChannels(customChannels);
                    renderIPTVList();
                }
            }

            if (action === "delete") {
                if (confirm(t('confirmDeleteChannel', 'Delete this channel?'))) {
                    let customChannels = await loadCustomIptvChannels();
                    customChannels.splice(customIndex, 1);
                    await saveCustomIptvChannels(customChannels);
                    renderIPTVList();
                }
            }

            closeMenu();
        });
    });
}

// Sync wrapper for renderIPTVList (for compatibility)
function renderIPTVListSync(searchFilter = "") {
    iptvList.innerHTML = "";
    renderIPTVList(searchFilter);
}

// Initial render when script loads
renderIPTVList();

