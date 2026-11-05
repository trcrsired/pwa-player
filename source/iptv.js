/*
 * IPTV channel browser.
 *
 * The built-in channel catalogue lives in pwaplayer.wasm as a C++ constexpr
 * table (see cpp/pwaplayer.cpp). C++ also does the search filtering, the
 * paging and the <li> markup generation, so this file only:
 *   - keeps the user's own channels (IndexedDB) which are always JS side,
 *   - splits one page between custom channels and built-in ones,
 *   - handles all clicks through a single delegated listener,
 *   - materialises a built-in channel object on demand (menus, playback).
 */
const iptvBtn = document.getElementById("iptvBtn");
const iptvBackBtn = document.getElementById("iptvBackBtn");
const iptvList = document.getElementById("iptvList");
const iptvSearch = document.getElementById("iptvSearch");

// Custom IPTV channels storage key
const CUSTOM_IPTV_KEY = "customIptvChannels";

// Channels per page: 0 disables paging entirely (old behaviour).
const DEFAULT_CHANNELS_PER_PAGE = 50;
let iptvPage = 0;
// Last loaded custom channels, indexed by their storage position.
let customChannelsCache = [];

function getIptvChannelsPerPage() {
    const raw = localStorage.getItem("iptvChannelsPerPage");
    if (raw === null) return DEFAULT_CHANNELS_PER_PAGE;
    const value = parseInt(raw, 10);
    if (!Number.isFinite(value) || value < 0) return DEFAULT_CHANNELS_PER_PAGE;
    return value;
}

function isNsfwUnlocked() {
    return localStorage.getItem("hiddenfeatures") === "true";
}

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
    if (!await glassConfirm(t('confirmClearChannels', 'Delete all custom channels?'))) return;

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

// Search input — a new search always starts at the first page
iptvSearch.addEventListener("input", () => {
    renderIPTVList(iptvSearch.value.trim().toLowerCase(), 0);
});

// Import/Export/Clear buttons
document.getElementById("iptvImportBtn")?.addEventListener("click", importCustomChannels);
document.getElementById("iptvExportBtn")?.addEventListener("click", exportCustomChannels);
document.getElementById("iptvClearBtn")?.addEventListener("click", clearCustomChannels);

// Paging controls
document.getElementById("iptvPrevPage")?.addEventListener("click", () => {
    renderIPTVList(iptvSearch.value.trim().toLowerCase(), iptvPage - 1);
});
document.getElementById("iptvNextPage")?.addEventListener("click", () => {
    renderIPTVList(iptvSearch.value.trim().toLowerCase(), iptvPage + 1);
});

// Share/copy helpers used by both the built-in and the custom channel menus.
function channelUrlText(channel, url) {
    const allUrls = (channel.urls && channel.urls.length) ? channel.urls : [url];
    return allUrls.join('\n');
}

function channelCopiedMessage(channel, url) {
    const many = channel.urls && channel.urls.length > 1;
    return many
        ? t('urlsCopied', 'URLs copied to clipboard')
        : t('urlCopied', 'URL copied to clipboard');
}

// Context menu for IPTV channels (on + button)
function showIPTVChannelMenu(channel, url, button) {    const menu = document.createElement("div");
    menu.className = "context-menu";

    const corsBypassUrl = localStorage.getItem("corsBypassUrl") || "";

    // Build menu items - default play without CORS
    const items = [
        { action: "play", label: t('playThis', 'Play'), cors: false, close: true },
        { action: "play-keep-open", label: t('playKeepPanel', 'Play (keep panel open)'), cors: false, close: false }
    ];

    // Add CORS options only if bypass server is configured
    if (corsBypassUrl) {
        items.push(
            { action: "play-cors", label: t('playWithCors', 'Play with CORS'), cors: true, close: true },
            { action: "play-cors-keep-open", label: t('playWithCorsKeepOpen', 'Play with CORS (keep open)'), cors: true, close: false }
        );
    }

    items.push(
        { action: "add", label: t('addToPlaylist', 'Add to Playlist'), cors: false }
    );

    // Add to Playlist with CORS if server configured
    if (corsBypassUrl) {
        items.push(
            { action: "add-cors", label: t('addToPlaylistWithCors', 'Add to Playlist with CORS'), cors: true }
        );
    }

    items.push(
        { action: "share", label: t('share', 'Share') },
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

                if (names.length === 0) {
                    alert(t('noPlaylistsAvailable', 'No playlists available. Please create a playlist first.'));
                    closeMenu();
                    return;
                }

                const index = await pickOption(t('whichPlaylist'), names);
                if (index === null) {
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

            if (action === "share") {
                await shareOrCopy({
                    title: channel.name,
                    text: `${channel.name}\n${channelUrlText(channel, url)}`,
                    copiedMessage: channelCopiedMessage(channel, url)
                });
            }

            if (action === "copy-url") {
                try {
                    await navigator.clipboard.writeText(channelUrlText(channel, url));
                    showToast(channelCopiedMessage(channel, url));
                } catch (err) {
                    console.warn("Failed to copy URL:", err);
                }
            }

            closeMenu();
        });
    });
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

// Fill in every `data-icon` placeholder that has no icon yet. C++ emits the
// markup with icon placeholders instead of duplicating the SVG paths there.
function hydrateIcons(root) {
    if (typeof setIcon !== "function") return;
    root.querySelectorAll("[data-icon]").forEach(el => {
        if (!iconRendered(el)) setIcon(el, el.dataset.icon);
    });
}

function channelMatchesSearch(channel, searchFilter) {
    if (!searchFilter) return true;
    if ((channel.name || "").toLowerCase().includes(searchFilter)) return true;
    const localized = channel.nameLocalized && channel.nameLocalized.zhcn;
    return !!(localized && localized.toLowerCase().includes(searchFilter));
}

// Custom channels are user data (IndexedDB), so their markup is built here.
// The structure mirrors what C++ emits for built-in channels so that a single
// delegated listener can handle both.
function renderCustomChannel(channel, index) {
    const urlList = channel.url ? [channel.url] : (channel.urls || []);
    const primaryUrl = urlList[0] || "";
    const unlocked = isNsfwUnlocked();

    const li = document.createElement("li");
    li.className = "iptv-node";
    li.dataset.ch = String(index);
    li.dataset.custom = "1";
    li.style.borderLeft = "3px solid #4caf50";

    const header = document.createElement("div");
    header.className = "iptv-header";

    const expandBtn = document.createElement("button");
    expandBtn.className = "iptv-toggle";
    if (urlList.length > 1) {
        const toggleText = document.createElement("span");
        toggleText.className = "iptv-toggle-text";
        expandBtn.appendChild(toggleText);
        const countBadge = document.createElement("span");
        countBadge.className = "iptv-count-badge";
        countBadge.textContent = `(${urlList.length})`;
        expandBtn.appendChild(countBadge);
        setIcon(toggleText, "chevronRight");
    } else {
        setIcon(expandBtn, "chevronRight");
    }

    const nameSpan = document.createElement("span");
    nameSpan.className = "iptv-name";
    nameSpan.textContent = channel.name;

    const customBadge = document.createElement("span");
    customBadge.textContent = "CUSTOM";
    customBadge.className = "iptv-badge";
    customBadge.style.cssText = "background:#4caf50;color:#fff;margin-left:6px;padding:2px 6px;border-radius:4px;font-size:10px;";
    nameSpan.appendChild(customBadge);

    if (channel.nsfw && unlocked) {
        const badge = document.createElement("span");
        badge.textContent = "NSFW";
        badge.className = "iptv-badge iptv-nsfw-badge";
        nameSpan.appendChild(badge);
    }

    if (channel.cors) {
        const badge = document.createElement("span");
        badge.textContent = "CORS";
        badge.className = "iptv-badge iptv-http-badge";
        badge.title = "Always uses CORS bypass";
        nameSpan.appendChild(badge);
    } else if (isIpAddressUrl(primaryUrl)) {
        const badge = document.createElement("span");
        badge.textContent = "IP";
        badge.className = "iptv-badge iptv-ip-badge";
        badge.title = "IP address - may need CORS bypass server";
        nameSpan.appendChild(badge);
    } else if (isPlainHttpUrl(primaryUrl)) {
        const badge = document.createElement("span");
        badge.textContent = "HTTP";
        badge.className = "iptv-badge iptv-http-badge";
        badge.title = "HTTP - may require CORS bypass";
        nameSpan.appendChild(badge);
    }

    const menuBtn = document.createElement("button");
    menuBtn.className = "iptv-menu";
    setIcon(menuBtn, "ellipsisV");
    menuBtn.title = "Menu";

    header.appendChild(expandBtn);
    header.appendChild(nameSpan);
    header.appendChild(menuBtn);

    const subList = document.createElement("ul");
    subList.className = "iptv-sub hidden";

    urlList.forEach((url, urlIndex) => {
        const subLi = document.createElement("li");
        subLi.className = "iptv-subitem";
        subLi.dataset.ch = String(index);
        subLi.dataset.url = String(urlIndex);

        const urlSpan = document.createElement("span");
        urlSpan.className = "iptv-url-text";
        urlSpan.textContent = url;

        if (isIpAddressUrl(url)) {
            const badge = document.createElement("span");
            badge.textContent = "IP";
            badge.className = "iptv-badge iptv-ip-badge";
            urlSpan.appendChild(badge);
        } else if (isPlainHttpUrl(url)) {
            const badge = document.createElement("span");
            badge.textContent = "HTTP";
            badge.className = "iptv-badge iptv-http-badge";
            urlSpan.appendChild(badge);
        }

        const addBtn = document.createElement("button");
        addBtn.className = "iptv-sub-menu";
        setIcon(addBtn, "ellipsisV");
        addBtn.title = "Menu";

        subLi.appendChild(urlSpan);
        subLi.appendChild(addBtn);
        subList.appendChild(subLi);
    });

    li.appendChild(header);
    li.appendChild(subList);
    iptvList.appendChild(li);
}

function updatePagination(total, pages, perPage) {
    const bar = document.getElementById("iptvPagination");
    if (!bar) return;

    const paged = perPage > 0 && pages > 1;
    bar.classList.toggle("hidden", !paged);

    const info = document.getElementById("iptvPageInfo");
    if (info) {
        info.textContent = paged
            ? t('pageOf', { current: iptvPage + 1, total: pages })
            : "";
    }
    const prev = document.getElementById("iptvPrevPage");
    const next = document.getElementById("iptvNextPage");
    if (prev) prev.disabled = !paged || iptvPage <= 0;
    if (next) next.disabled = !paged || iptvPage >= pages - 1;
    bar.dataset.total = String(total);
}

// Render one page of the channel list.
// Order is: custom channels first, then the built-in catalogue, and paging is
// applied across both so a page always holds `channelsPerPage` entries.
let renderTicket = 0;

async function renderIPTVList(searchFilter = "", page = undefined) {
    const ticket = ++renderTicket;
    const filter = (searchFilter || "").trim().toLowerCase();
    iptvList.innerHTML = "";

    const unlocked = isNsfwUnlocked();

    // Custom channels (JS side, filtering is trivial for a handful of entries)
    customChannelsCache = await loadCustomIptvChannels();
    // A newer render started while IndexedDB was answering: drop this one.
    if (ticket !== renderTicket) return;
    const filteredCustom = [];
    customChannelsCache.forEach((channel, index) => {
        if (channel.nsfw && !unlocked) return;
        if (!channelMatchesSearch(channel, filter)) return;
        filteredCustom.push({ channel, index });
    });

    // Built-in catalogue (wasm side: C++ filters, pages and renders)
    const builtinTotal = window.pwaIptvFilteredCount
        ? window.pwaIptvFilteredCount(filter, unlocked)
        : 0;

    const total = filteredCustom.length + builtinTotal;
    const perPage = getIptvChannelsPerPage();
    const pages = perPage > 0 ? Math.max(1, Math.ceil(total / perPage)) : 1;
    if (page === undefined) page = iptvPage;
    iptvPage = Math.min(Math.max(0, page | 0), pages - 1);

    const start = perPage > 0 ? iptvPage * perPage : 0;
    const end = perPage > 0 ? Math.min(total, start + perPage) : total;

    // 1. custom channel slice of this page
    const customEnd = Math.min(end, filteredCustom.length);
    for (let i = start; i < customEnd; ++i) {
        renderCustomChannel(filteredCustom[i].channel, filteredCustom[i].index);
    }

    // 2. built-in slice of this page
    if (window.pwaWasm && window.pwaWasm.failed && iptvPage === 0) {
        const notice = document.createElement("li");
        notice.className = "iptv-hint";
        notice.textContent = t('iptvCatalogueUnavailable',
            "The built-in channel list (pwaplayer.wasm) could not be loaded, so only your own channels are shown.");
        iptvList.appendChild(notice);
    }
    if (end > filteredCustom.length) {
        const builtinStart = Math.max(0, start - filteredCustom.length);
        const builtinTake = end - Math.max(start, filteredCustom.length);
        const rendered = window.pwaIptvRenderPage
            ? window.pwaIptvRenderPage(filter, builtinStart, builtinTake, unlocked, window.pwaLangId())
            : null;
        if (rendered && rendered.html) {
            iptvList.insertAdjacentHTML("beforeend", rendered.html);
            hydrateIcons(iptvList);
        }
    }

    updatePagination(total, pages, perPage);

    const countSpan = document.getElementById("iptvChannelCount");
    if (countSpan) countSpan.textContent = total;
}

/* ------------------------------------------------------------------ *
 * Delegated interaction handling
 * ------------------------------------------------------------------ */

// Resolve the channel descriptor behind a clicked node.
function resolveChannelNode(node) {
    const li = node.closest(".iptv-node");
    if (!li) return null;
    const index = parseInt(li.dataset.ch, 10);
    if (!Number.isFinite(index)) return null;

    if (li.dataset.custom) {
        const channel = customChannelsCache[index];
        if (!channel) return null;
        return { channel, custom: true, customIndex: index };
    }
    const channel = window.pwaIptvChannel ? window.pwaIptvChannel(index) : null;
    if (!channel) return null;
    return { channel, custom: false, customIndex: -1, builtinIndex: index };
}

function toggleChannelSubList(toggleBtn) {
    const li = toggleBtn.closest(".iptv-node");
    const subList = li && li.querySelector(".iptv-sub");
    if (!subList) return;
    const hidden = subList.classList.toggle("hidden");
    const chevron = hidden ? "chevronRight" : "chevronDown";
    const toggleText = toggleBtn.querySelector(".iptv-toggle-text");
    setIcon(toggleText || toggleBtn, chevron);
}

function openChannelMenu(button) {
    const target = resolveChannelNode(button);
    if (!target) return;

    const subItem = button.closest(".iptv-subitem");
    const urlIndex = subItem ? parseInt(subItem.dataset.url, 10) : 0;
    const url = target.custom
        ? ((target.channel.url ? [target.channel.url] : target.channel.urls) || [])[urlIndex]
        : window.pwaIptvChannelUrl(target.builtinIndex, urlIndex);

    if (!url) return;

    if (target.custom) {
        showCustomChannelMenu(target.channel, url, button, target.customIndex);
    } else {
        showIPTVChannelMenu(target.channel, url, button);
    }
}

function playChannelUrl(url, channelName) {
    play_source_title(url, channelName, null, false);
    if (typeof isAutoHidePanelEnabled === 'function' && isAutoHidePanelEnabled()) {
        closeActiveView();
    }
}

iptvList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const toggleBtn = target.closest(".iptv-toggle");
    if (toggleBtn) {
        toggleChannelSubList(toggleBtn);
        return;
    }

    const menuBtn = target.closest(".iptv-menu, .iptv-sub-menu");
    if (menuBtn) {
        event.stopPropagation();
        openChannelMenu(menuBtn);
        return;
    }

    const urlSpan = target.closest(".iptv-url-text");
    if (urlSpan) {
        const subItem = urlSpan.closest(".iptv-subitem");
        const resolved = resolveChannelNode(urlSpan);
        if (!resolved || !subItem) return;
        const urlIndex = parseInt(subItem.dataset.url, 10) || 0;
        const url = resolved.custom
            ? ((resolved.channel.url ? [resolved.channel.url] : resolved.channel.urls) || [])[urlIndex]
            : window.pwaIptvChannelUrl(resolved.builtinIndex, urlIndex);
        if (url) playChannelUrl(url, resolved.channel.name);
        return;
    }

    const nameSpan = target.closest(".iptv-name");
    if (nameSpan) {
        const resolved = resolveChannelNode(nameSpan);
        if (!resolved) return;
        const channel = resolved.channel;
        const urlList = channel.urls && channel.urls.length ? channel.urls : [channel.url];
        if (!urlList[0]) return;
        if (urlList.length > 1 && typeof play_iptv_with_fallback === 'function') {
            play_iptv_with_fallback(urlList, channel.name, false);
            if (typeof isAutoHidePanelEnabled === 'function' && isAutoHidePanelEnabled()) {
                closeActiveView();
            }
        } else {
            playChannelUrl(urlList[0], channel.name);
        }
    }
});

// Menu for custom channels (with delete option)
function showCustomChannelMenu(channel, url, button, customIndex) {
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
        { action: "share", label: t('share', 'Share') },
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

                if (names.length === 0) {
                    alert(t('noPlaylistsAvailable', 'No playlists available. Please create a playlist first.'));
                    closeMenu();
                    return;
                }

                const index = await pickOption(t('whichPlaylist', 'Add to which playlist?'), names);
                if (index === null) {
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

            if (action === "share") {
                await shareOrCopy({
                    title: channel.name,
                    text: `${channel.name}\n${channelUrlText(channel, url)}`,
                    copiedMessage: channelCopiedMessage(channel, url)
                });
            }

            if (action === "copy-url") {
                try {
                    await navigator.clipboard.writeText(channelUrlText(channel, url));
                    showToast(channelCopiedMessage(channel, url));
                } catch (err) {
                    console.warn("Failed to copy URL:", err);
                }
            }

            if (action === "rename") {
                const newName = await glassPrompt(t('newChannelName', 'New channel name:'), channel.name);
                if (newName && newName.trim()) {
                    let customChannels = await loadCustomIptvChannels();
                    customChannels[customIndex].name = newName.trim();
                    await saveCustomIptvChannels(customChannels);
                    renderIPTVList();
                }
            }

            if (action === "delete") {
                if (await glassConfirm(t('confirmDeleteChannel', 'Delete this channel?'))) {
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

// Expose to the classic scripts (settings.js, profile import/export) that want
// to refresh the list after changing the language, the paging size or the data.
window.renderIPTVList = renderIPTVList;
window.getIptvChannelsPerPage = getIptvChannelsPerPage;

// Initial render — wait for the WebAssembly catalogue, then draw page 1.
if (window.pwaWasmReady) {
    window.pwaWasmReady.then(() => renderIPTVList());
} else {
    renderIPTVList();
}

// Re-render when the language changes so localized channel names update.
window.addEventListener("pwa-language-changed", () => {
    renderIPTVList(iptvSearch.value.trim().toLowerCase(), iptvPage);
});
