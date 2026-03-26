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
            console.log(`rootHandle, dirName=${dirName}`);
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


function showPlaylistItemMenu(playlistName, index, x, y) {
    // Close any existing menu
    const existing = document.querySelector(".context-menu");
    if (existing) existing.remove();

    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";

    menu.innerHTML = `
        <div class="menu-item" data-action="play">${t('playThis', 'Play')}</div>
        <div class="menu-item" data-action="play-keep-open">${t('playKeepPanel', 'Play (keep panel open)')}</div>
        <div class="menu-item danger" data-action="delete">${t('delete', 'Delete')}</div>
        <div class="menu-item" data-action="move-up">${t('moveUp', 'Move Up')}</div>
        <div class="menu-item" data-action="move-down">${t('moveDown', 'Move Down')}</div>
        <div class="menu-item" data-action="close">${t('close', 'Close')}</div>
    `;

    document.body.appendChild(menu);

    const closeMenu = () => menu.remove();

    // Auto-close when clicking outside
    setTimeout(() => {
        document.addEventListener("mousedown", (e) => {
            if (!menu.contains(e.target)) closeMenu();
        }, { once: true });
    }, 0);

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

    Object.entries(playlists).forEach(([playlistName, items]) => {
        const li = document.createElement("li");
        li.className = "playlist-node";

        li.innerHTML = `
            <div class="playlist-header">
                <button class="toggle" aria-label="Toggle playlist">+</button>
                <span class="playlist-name">${escapeHTML(playlistName)}</span>
            </div>
            <ul class="playlist-items hidden"></ul>
        `;

        const header = li.querySelector(".playlist-header");
        const toggleBtn = header.querySelector(".toggle");
        const itemsContainer = li.querySelector(".playlist-items");

        toggleBtn.addEventListener("click", () => {
            const hidden = itemsContainer.classList.toggle("hidden");
            toggleBtn.textContent = hidden ? "+" : "−";
        });

        header.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            showPlaylistHeaderMenu(playlistName, e.pageX, e.pageY);
        });

        items.forEach((item, index) => {
            const itemLi = document.createElement("li");
            itemLi.className = "playlist-item";

            itemLi.innerHTML = `
                <span class="item-origin">${escapeHTML(item.path)}</span>
            `;

            itemLi.addEventListener("click", async () => {
                await startNowPlayingFromPlaylist(playlistName, index);
                if (typeof isAutoHidePanelEnabled === 'function' && isAutoHidePanelEnabled()) {
                    closeActiveView();
                }
            });

            itemLi.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                showPlaylistItemMenu(playlistName, index, e.pageX, e.pageY);
            });

            itemsContainer.appendChild(itemLi);
        });

        tree.appendChild(li);
    });
}

function showPlaylistHeaderMenu(playlistName, x, y) {
    // Close any existing menu first
    const existing = document.querySelector(".context-menu");
    if (existing) existing.remove();

    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";

    menu.innerHTML = `
        <div class="menu-item" data-action="rename">${t('rename', 'Rename')}</div>
        <div class="menu-item" data-action="duplicate">${t('duplicate', 'Duplicate')}</div>
        <div class="menu-item" data-action="export">${t('export', 'Export')}</div>
        <div class="menu-item" data-action="import-from-now-playing">${t('importFromNowPlaying', 'Import from Now Playing')}</div>
        <div class="menu-item danger" data-action="delete">${t('delete', 'Delete')}</div>
        <div class="menu-item danger" data-action="clear">${t('clearPlaylist', 'Clear Playlist')}</div>
        <div class="menu-item" data-action="close">${t('close', 'Close')}</div>
    `;

    document.body.appendChild(menu);

    const closeMenu = () => menu.remove();

    // Auto-close when clicking outside
    setTimeout(() => {
        document.addEventListener("mousedown", (e) => {
            if (!menu.contains(e.target)) closeMenu();
        }, { once: true });
    }, 0);

    // Menu actions
    menu.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", async () => {
            const action = item.dataset.action;
            const playlists = await playlists_load();

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
    playlist_renderTree();
});

// Back from Playlist to player
document.getElementById("playlistBackBtn").addEventListener("click", () => {
    closeActiveView();
});

document.getElementById("newPlaylistBtn").addEventListener("click", async () => {
    const name = prompt("Enter new playlist name:");

    if (!name) return;

    const trimmed = name.trim();
    if (!trimmed) {
        alert("Playlist name cannot be empty.");
        return;
    }

    const playlists = await playlists_load();

    if (playlists[trimmed]) {
        alert("A playlist with this name already exists.");
        return;
    }

    playlists[trimmed] = []; // empty playlist
    await playlists_save(playlists);

    playlist_renderTree();
});