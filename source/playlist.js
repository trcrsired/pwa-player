// Load all playlists from IndexedDB
async function playlists_load() {
    // Structure:
    // {
    //   "Default": [ { name, path }, ... ],
    //   "MyPlaylist": [ ... ]
    // }
    return await kv_get("playlists") || { "Default": [] };
}

// Save all playlists to IndexedDB
async function playlists_save(all) {
    await kv_set("playlists", all);
}

// Export all playlists to JSON file
async function exportAllPlaylists() {
    const playlists = await playlists_load();

    const json = JSON.stringify(playlists, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `playlists-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
}

// Import playlists from JSON file
function importPlaylists() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const t = (key, params) => {
            let text = window.i18n ? window.i18n.t(key) : key;
            if (params && typeof params === 'object') {
                for (const [k, v] of Object.entries(params)) {
                    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
                }
            }
            return text;
        };

        try {
            const text = await file.text();
            const imported = JSON.parse(text);

            if (typeof imported !== 'object' || imported === null) {
                alert(t('invalidFormat', 'Invalid format: expected playlist object'));
                return;
            }

            const existing = await playlists_load();
            const merged = { ...existing };

            // Merge imported playlists
            for (const [name, items] of Object.entries(imported)) {
                if (!Array.isArray(items)) continue;
                if (merged[name]) {
                    // Append to existing playlist
                    merged[name] = [...merged[name], ...items];
                } else {
                    merged[name] = items;
                }
            }

            await playlists_save(merged);

            const playlistCount = Object.keys(imported).length;
            alert(t('importSuccessPlaylists', { count: playlistCount }));
            playlist_renderTree();
        } catch (err) {
            alert(t('importFailed', 'Failed to import: ') + err.message);
        }
    };

    input.click();
}


// Resolve a path inside a given root directory.
// Example: resolveUnderRoot(rootHandle, "imports/Anime/1.webm")
async function resolveUnderRoot(rootHandle, path) {
    const parts = path.split("/");
    let current = rootHandle;
    for (let i = 0; i != parts.length; ++i) {
        const name = parts[i];

        // Last part → file
        if (i === parts.length - 1) {
            return await current.getFileHandle(name);
        }

        // Directory
        current = await current.getDirectoryHandle(name);
    }
}

async function storage_resolvePath(pointer) {

    // indexeddb://
    if (pointer.startsWith("indexeddb://")) {
        const path = pointer.slice("indexeddb://".length);
        // path is like "idb/folder/file.webm"
        const parts = path.split("/");
        const rootName = parts.shift(); // "idb"
        const folder = parts.shift();   // folder name like "idb_123456"
        const fileName = parts.join("/"); // filename

        // Get the file from IndexedDB
        const fileEntry = await window.idb_getFile(`${folder}/${fileName}`);
        if (!fileEntry) {
            throw new Error(`IndexedDB file not found: ${pointer}`);
        }
        // Return a File object
        return new File([fileEntry.blob], fileEntry.name, { type: fileEntry.type || "application/octet-stream" });
    }

    // navigator_storage://
    if (pointer.startsWith("navigator_storage://")) {
        const path = pointer.slice("navigator_storage://".length);
        const root = await navigator.storage.getDirectory();
        return await resolveUnderRoot(root, path);
    }

    // external_storage://
    if (pointer.startsWith("external_storage://")) {
        const path = pointer.slice("external_storage://".length);

        // Split into: <rootName>/<dirName>/sub/path/file
        const parts = path.split("/");
        const rootName = parts.shift();   // e.g. "external"
        const dirName = parts.shift();    // e.g. "Music"

        // Load external directory handles
        const externalDirs = await loadExternalDirs();

        // Only handle the "external" pseudo-root for now
        if (rootName === "external") {

            const rootHandle = externalDirs[dirName];
            if (!rootHandle) {
                throw new Error(`External directory "${dirName}" not found`);
            }

            // Ensure permission
            const ok = await verifyPermission(rootHandle);
            if (!ok) {
                throw new Error("Permission denied for external directory");
            }

            // Resolve remaining path
            const remainingPath = parts.join("/");
            return await resolveUnderRoot(rootHandle, remainingPath);
        }

        // Unknown external pseudo-root → ignore for now
        console.warn(`Unknown external root "${rootName}", ignoring.`);
        return pointer;
    }

    // Unknown schema → return as-is
    return pointer;
}


function showPlaylistItemMenu(playlistName, index, button) {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;

    const menu = document.createElement("div");
    menu.className = "context-menu";

    menu.innerHTML = `
        <div class="menu-item" data-action="play">${t('playThis', 'Play')}</div>
        <div class="menu-item" data-action="play-keep-open">${t('playKeepPanel', 'Play (keep panel open)')}</div>
        <div class="menu-item danger" data-action="delete">${t('delete', 'Delete')}</div>
        <div class="menu-item" data-action="move-up">${t('moveUp', 'Move Up')}</div>
        <div class="menu-item" data-action="move-down">${t('moveDown', 'Move Down')}</div>
        <div class="menu-item" data-action="properties">${t('properties', 'Properties')}</div>
        <div class="menu-item" data-action="close">${t('close', 'Close')}</div>
    `;

    if (!positionMenu(menu, button)) return;

    const closeMenu = () => menu.remove();

    menu.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", async () => {
            const action = item.dataset.action;
            const playlists = await playlists_load();
            const list = playlists[playlistName];

            if (action === "play") {
                await startNowPlayingFromPlaylist(playlistName, index);
                closeActiveView();
                closeMenu();
                return;
            }

            if (action === "play-keep-open") {
                await startNowPlayingFromPlaylist(playlistName, index);
                closeMenu();
                return;
            }

            if (action === "delete") {
                const ok = confirm(`${t('confirmRemoveItem', 'Remove this item from playlist')} "${playlistName}"?`);
                if (ok) {
                    list.splice(index, 1);
                }
            }

            if (action === "move-up" && index > 0) {
                [list[index - 1], list[index]] = [list[index], list[index - 1]];
            }

            if (action === "move-down" && index < list.length - 1) {
                [list[index + 1], list[index]] = [list[index], list[index + 1]];
            }

            if (action === "properties") {
                const item = list[index];
                const info = [
                    `${t('playlistName', 'Playlist')}: ${playlistName}`,
                    `${t('index', 'Index')}: ${index + 1} / ${list.length}`,
                    `${t('name', 'Name')}: ${item.name || 'N/A'}`,
                    `${t('path', 'Path')}: ${item.path || 'N/A'}`
                ];
                alert(info.join('\n\n'));
                return;
            }

            if (action === "close") {
                closeMenu();
                return;
            }

            await playlists_save(playlists);
            playlist_renderTree();
            closeMenu();
        });
    });
}

async function playlist_renderTree() {
    const playlists = await playlists_load();
    const tree = document.getElementById("playlistTree");
    tree.innerHTML = "";

    const defaultPlaylist = localStorage.getItem("defaultPlaylist") || "";

    Object.entries(playlists).forEach(([playlistName, items]) => {
        const isDefault = playlistName === defaultPlaylist;
        const defaultBadge = isDefault ? ' ⭐' : '';

        const li = document.createElement("li");
        li.className = "storage-node";

        li.innerHTML = `
            <div class="storage-header">
                <button class="toggle">+</button>
                <span class="storage-name">${escapeHTML(playlistName)}${defaultBadge} (${items.length})</span>
                <button class="storage-menu" title="Menu">⋮</button>
            </div>
            <ul class="storage-sub hidden"></ul>
        `;

        const header = li.querySelector(".storage-header");
        const toggleBtn = li.querySelector(".toggle");
        const itemsContainer = li.querySelector(".storage-sub");
        const menuBtn = li.querySelector(".storage-menu");

        // Click to expand/collapse (but not on menu button)
        header.addEventListener("click", (e) => {
            if (e.target === menuBtn) return;
            const hidden = itemsContainer.classList.toggle("hidden");
            toggleBtn.textContent = hidden ? "+" : "−";
        });

        // Burger menu button
        menuBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            showPlaylistHeaderMenu(playlistName, e.currentTarget);
        });

        items.forEach((item, index) => {
            const itemLi = document.createElement("li");
            itemLi.className = "storage-sub-item";

            const itemName = item.name || item.path;
            const hasCors = item.corsBypass === true;

            itemLi.innerHTML = `
                <div class="storage-sub-header">
                    <span class="sub-name">${escapeHTML(itemName)}${hasCors ? '<span class="iptv-badge iptv-http-badge" style="margin-left:6px;">CORS</span>' : ''}</span>
                    <div class="sub-actions">
                        <button class="sub-menu" title="Menu">⋮</button>
                    </div>
                </div>
            `;

            const subHeader = itemLi.querySelector(".storage-sub-header");
            const subMenuBtn = itemLi.querySelector(".sub-menu");

            // Click on name to play
            subHeader.addEventListener("click", async (e) => {
                if (e.target === subMenuBtn) return;
                await startNowPlayingFromPlaylist(playlistName, index);
                if (typeof isAutoHidePanelEnabled === 'function' && isAutoHidePanelEnabled()) {
                    closeActiveView();
                }
            });

            // Menu button
            subMenuBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                showPlaylistItemMenu(playlistName, index, e.currentTarget);
            });

            itemsContainer.appendChild(itemLi);
        });

        tree.appendChild(li);
    });
}

function showPlaylistHeaderMenu(playlistName, button) {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;

    const defaultPlaylist = localStorage.getItem("defaultPlaylist") || "";
    const isDefault = playlistName === defaultPlaylist;

    const menu = document.createElement("div");
    menu.className = "context-menu";

    menu.innerHTML = `
        <div class="menu-item" data-action="set-default">${isDefault ? '⭐ ' + t('defaultPlaylist', 'Default') : t('setDefaultPlaylist', 'Set as Default')}</div>
        <div class="menu-item" data-action="rename">${t('rename', 'Rename')}</div>
        <div class="menu-item" data-action="duplicate">${t('duplicate', 'Duplicate')}</div>
        <div class="menu-item" data-action="export">${t('export', 'Export')}</div>
        <div class="menu-item" data-action="import-from-now-playing">${t('importFromNowPlaying', 'Import from Now Playing')}</div>
        <div class="menu-item danger" data-action="delete">${t('delete', 'Delete')}</div>
        <div class="menu-item danger" data-action="clear">${t('clearPlaylist', 'Clear Playlist')}</div>
        <div class="menu-item" data-action="close">${t('close', 'Close')}</div>
    `;

    if (!positionMenu(menu, button)) return;

    const closeMenu = () => menu.remove();

    // Menu actions
    menu.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", async () => {
            const action = item.dataset.action;
            const playlists = await playlists_load();

            if (action === "set-default") {
                if (isDefault) {
                    // Unset as default
                    localStorage.removeItem("defaultPlaylist");
                } else {
                    // Set as default
                    localStorage.setItem("defaultPlaylist", playlistName);
                }
                playlist_renderTree();
                closeMenu();
                return;
            }

            if (action === "import-from-now-playing") {
                // Get current track from now playing
                const currentEntry = getCurrentTrack();

                if (!currentEntry) {
                    alert(t('noTrackPlaying', 'No track is currently playing.'));
                    closeMenu();
                    return;
                }

                playlists[playlistName].push({
                    name: currentEntry.name,
                    path: currentEntry.path
                });
                await playlists_save(playlists);
                alert(`${t('addedToPlaylist', 'Added')} "${currentEntry.name}" ${t('toPlaylist', 'to playlist')} "${playlistName}".`);
            }

            if (action === "rename") {
                const newName = prompt(t('newPlaylistName', 'New playlist name:'), playlistName);
                if (newName && newName.trim()) {
                    playlists[newName.trim()] = playlists[playlistName];
                    delete playlists[playlistName];
                }
            }

            if (action === "duplicate") {
                const copyName = playlistName + " " + t('copy', 'Copy');
                playlists[copyName] = JSON.parse(JSON.stringify(playlists[playlistName]));
            }

            if (action === "export") {
                const json = JSON.stringify(playlists[playlistName], null, 2);
                console.log("EXPORT PLAYLIST:", json);
                alert(t('exportedToConsole', 'Playlist exported to console.'));
            }

            if (action === "delete") {
                const confirmDelete = confirm(`${t('confirmDeletePlaylist', 'Delete playlist')} "${playlistName}"?`);
                if (confirmDelete) {
                    delete playlists[playlistName];
                }
            }

            if (action === "clear") {
                const ok = confirm(`${t('confirmClearPlaylist', 'Clear ALL items in playlist')} "${playlistName}"?`);
                if (ok) {
                    playlists[playlistName] = []; // clear entire playlist
                }
            }

            if (action === "close") {
                closeMenu();
                return;
            }

            await playlists_save(playlists);
            playlist_renderTree();
            closeMenu();
        });
    });
}

// Open Playlist view
document.getElementById("playlistBtn").addEventListener("click", () => {
    switchView("playlistView");
});

// Back from Playlist to player
document.getElementById("playlistBackBtn").addEventListener("click", () => {
    closeActiveView();
});

// New playlist button
document.getElementById("newPlaylistBtn").addEventListener("click", async () => {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
    const name = prompt(t('newPlaylistName', "Enter new playlist name:"));

    if (!name) return;

    const trimmed = name.trim();
    if (!trimmed) {
        alert(t('playlistNameCannotBeEmpty', "Playlist name cannot be empty."));
        return;
    }

    const playlists = await playlists_load();

    if (playlists[trimmed]) {
        alert(t('playlistAlreadyExists', "A playlist with this name already exists."));
        return;
    }

    playlists[trimmed] = []; // empty playlist
    await playlists_save(playlists);

    playlist_renderTree();
});

// Import playlists button
document.getElementById("importPlaylistBtn").addEventListener("click", () => {
    importPlaylists();
});

// Export playlists button
document.getElementById("exportPlaylistBtn").addEventListener("click", () => {
    exportAllPlaylists();
});

// Initial render when script loads
playlist_renderTree();