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

async function playlist_render() {
    const list = await playlist_load();
    const ul = document.getElementById("playlistList");
    ul.innerHTML = "";

    list.forEach((item, index) => {
        const li = document.createElement("li");
        li.className = "list-item";
        li.innerHTML = `
            <span>${item.name}</span>
            <button class="remove-btn" data-index="${index}">✖</button>
        `;
        ul.appendChild(li);
    });

    // Remove item
    ul.querySelectorAll(".remove-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const idx = parseInt(btn.dataset.index, 10);
            const list = await playlist_load();
            list.splice(idx, 1);
            await playlist_save(list);
            playlist_render();
        });
    });
}


async function addToPlaylist(name) {
    alert(`TODO: add items to playlist "${name}"`);
}

function showPlaylistHeaderMenu(playlistName, x, y) {
    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";

    menu.innerHTML = `
        <div class="menu-item" data-action="rename">Rename</div>
        <div class="menu-item" data-action="duplicate">Duplicate</div>
        <div class="menu-item" data-action="export">Export</div>
        <div class="menu-item danger" data-action="delete">Delete</div>
        <div class="menu-item" data-action="close">Close</div>
    `;

    document.body.appendChild(menu);

    const closeMenu = () => menu.remove();
    setTimeout(() => document.addEventListener("click", closeMenu, { once: true }), 0);

    menu.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", async () => {
            const action = item.dataset.action;
            const playlists = await playlists_load();

            if (action === "rename") {
                const newName = prompt("New playlist name:", playlistName);
                if (newName && newName.trim()) {
                    playlists[newName.trim()] = playlists[playlistName];
                    delete playlists[playlistName];
                }
            }

            if (action === "duplicate") {
                const copyName = playlistName + " Copy";
                playlists[copyName] = JSON.parse(JSON.stringify(playlists[playlistName]));
            }

            if (action === "export") {
                const json = JSON.stringify(playlists[playlistName], null, 2);
                console.log("EXPORT PLAYLIST:", json);
                alert("Playlist exported to console.");
            }

            if (action === "delete") {
                const confirmDelete = confirm(`Delete playlist "${playlistName}"?`);
                if (confirmDelete) {
                    delete playlists[playlistName];
                }
            }

            if (action === "close")
            {
                closeMenu(); return;
            }
            await playlists_save(playlists);
            playlist_renderTree();
        });
    });
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

async function externalStorage_setRoot(handle) {
    const db = await idb.openDB("storage-roots", 1, {
        upgrade(db) {
            db.createObjectStore("roots");
        }
    });

    await db.put("roots", handle, "external");
    window.externalStorageRoot = handle;
}

async function storage_resolvePath(pointer) {

    // navigator.storage://
    if (pointer.startsWith("navigator_storage://")) {
        const path = pointer.slice("navigator_storage://".length);
        const root = await navigator.storage.getDirectory();
        return await resolveUnderRoot(root, path);
    }

    // external_storage://
    if (pointer.startsWith("external_storage://")) {
        const path = pointer.slice("external_storage://".length);

        if (!window.externalStorageRoot) {
            throw new Error("external_storage:// root not set");
        }

        return await resolveUnderRoot(window.externalStorageRoot, path);
    }

    return pointer;
}

function showPlaylistItemMenu(playlistName, index, x, y) {
    // Close any existing menu
    const existing = document.querySelector(".context-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";

    menu.innerHTML = `
        <div class="menu-item danger" data-action="delete">Delete</div>
        <div class="menu-item" data-action="move-up">Move Up</div>
        <div class="menu-item" data-action="move-down">Move Down</div>
        <div class="menu-item" data-action="close">Close</div>
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

            if (action === "delete") {
                const ok = confirm(`Remove this item from playlist "${playlistName}"?`);
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
                <span class="playlist-name">${playlistName}</span>
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
                <span class="item-origin">${item.path}</span>
            `;

            itemLi.addEventListener("click", async () => {
                await startNowPlayingFromPlaylist(playlistName, index);
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

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";

    menu.innerHTML = `
        <div class="menu-item" data-action="rename">Rename</div>
        <div class="menu-item" data-action="duplicate">Duplicate</div>
        <div class="menu-item" data-action="export">Export</div>
        <div class="menu-item danger" data-action="delete">Delete</div>
        <div class="menu-item danger" data-action="clear">Clear Playlist</div>
        <div class="menu-item" data-action="close">Close</div>
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

            if (action === "rename") {
                const newName = prompt("New playlist name:", playlistName);
                if (newName && newName.trim()) {
                    playlists[newName.trim()] = playlists[playlistName];
                    delete playlists[playlistName];
                }
            }

            if (action === "duplicate") {
                const copyName = playlistName + " Copy";
                playlists[copyName] = JSON.parse(JSON.stringify(playlists[playlistName]));
            }

            if (action === "export") {
                const json = JSON.stringify(playlists[playlistName], null, 2);
                console.log("EXPORT PLAYLIST:", json);
                alert("Playlist exported to console.");
            }

            if (action === "delete") {
                const confirmDelete = confirm(`Delete playlist "${playlistName}"?`);
                if (confirmDelete) {
                    delete playlists[playlistName];
                }
            }

            if (action === "clear") {
                const ok = confirm(`Clear ALL items in playlist "${playlistName}"?`);
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
    document.getElementById("playlistView").classList.remove("hidden");
    document.getElementById("playerContainer").classList.add("hidden");
    playlist_renderTree();
});

// Back from Playlist to player
document.getElementById("playlistBackBtn").addEventListener("click", () => {
    document.getElementById("playlistView").classList.add("hidden");
    document.getElementById("playerContainer").classList.remove("hidden");
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