// ============================================================
// Central definition of all import roots inside private storage
// ============================================================
//
// Each entry defines:
// - schema: storage backend (navigator_storage, external_storage, indexeddb)
// - rootName: logical name used in pointer paths
// - dirName: actual directory name inside private storage
// - enabled: allows future toggling or feature flags
// - allowModification: if true, allows delete/rename operations on content
// - useRemoveLabel: if true, use "Remove entry" label instead of "Delete"
//
const IMPORT_ROOTS = [
    {
        schema: "navigator_storage",
        rootName: "imports",
        dirName: "imports",
        enabled: true,
        showSubdirs: true,
        allowModification: true,
        allowFolderRename: true,
        allowFileRename: true,
        useRemoveLabel: false
    },
    {
        schema: "navigator_storage",
        rootName: "files",
        dirName: "files",
        enabled: true,
        showSubdirs: true,
        allowModification: true,
        allowFolderRename: false,
        allowFileRename: true,
        useRemoveLabel: false
    },
    {
        schema: "external_storage",
        rootName: "external",
        dirName: "external",
        enabled: true,
        showSubdirs: true,
        allowModification: false,
        allowFolderRename: true,
        allowFileRename: false,
        useRemoveLabel: true
    },
    {
        schema: "indexeddb",
        rootName: "idb",
        dirName: "idb",
        enabled: true,
        showSubdirs: true,
        allowModification: true,
        allowFolderRename: false,
        allowFileRename: true,
        useRemoveLabel: false
    }
];

// ============================================================
// IndexedDB Storage Backend
// ============================================================
const IDB_DB_NAME = "PWAPlayerIDB";
const IDB_STORE_NAME = "files";

let idb_db = null;

async function idb_init() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            idb_db = request.result;
            resolve(idb_db);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
                db.createObjectStore(IDB_STORE_NAME, { keyPath: "path" });
            }
        };
    });
}

async function idb_getStore(mode = "readonly") {
    if (!idb_db) await idb_init();
    const tx = idb_db.transaction(IDB_STORE_NAME, mode);
    return tx.objectStore(IDB_STORE_NAME);
}

async function idb_listFiles() {
    try {
        const store = await idb_getStore("readonly");
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onerror = () => {
                console.error("idb_listFiles error:", request.error);
                reject(request.error);
            };
            request.onsuccess = () => resolve(request.result || []);
        });
    } catch (err) {
        console.error("idb_listFiles failed:", err);
        return [];
    }
}

async function idb_getFile(path) {
    const store = await idb_getStore("readonly");
    return new Promise((resolve, reject) => {
        const request = store.get(path);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

// Put file into IndexedDB with virtual folder
// folder: virtual folder name like "idb_1234567890"
// name: filename
async function idb_putFile(folder, name, blob, type) {
    const store = await idb_getStore("readwrite");
    return new Promise((resolve, reject) => {
        const path = `${folder}/${name}`;
        const entry = { path, folder, name, blob, type, lastModified: Date.now() };
        const request = store.put(entry);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(entry);
    });
}

async function idb_deleteFile(path) {
    const store = await idb_getStore("readwrite");
    return new Promise((resolve, reject) => {
        const request = store.delete(path);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

// Delete all files in a folder
async function idb_deleteFolder(folder) {
    const files = await idb_listFiles();
    const folderFiles = files.filter(f => f.folder === folder);
    for (const file of folderFiles) {
        await idb_deleteFile(file.path);
    }
}

async function idb_clearAll() {
    const store = await idb_getStore("readwrite");
    return new Promise((resolve, reject) => {
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

// Get list of virtual folders
async function idb_listFolders() {
    try {
        const files = await idb_listFiles();
        const folders = new Set();
        for (const f of files) {
            if (f && f.folder) {
                folders.add(f.folder);
            }
        }
        return Array.from(folders);
    } catch (err) {
        console.error("idb_listFolders failed:", err);
        return [];
    }
}

// Get files in a specific folder
async function idb_getFilesInFolder(folder) {
    try {
        const files = await idb_listFiles();
        return files.filter(f => f && f.folder === folder);
    } catch (err) {
        console.error("idb_getFilesInFolder failed:", err);
        return [];
    }
}

// Add all files from an IndexedDB folder to a playlist
async function addIndexedDBFolderToPlaylist(folderName) {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
    try {
        const files = await idb_getFilesInFolder(folderName);
        if (!files || files.length === 0) {
            alert(`${t('noFilesInFolder', 'No files found in folder')} "${folderName}".`);
            return;
        }

        // Filter to only playable files
        const playableFiles = files.filter(f => isPlaylistFile(f.name));
        if (playableFiles.length === 0) {
            alert(`${t('noPlayableFiles', 'No playable files found in folder')} "${folderName}".`);
            return;
        }

        // Load playlists and prompt user
        const playlists = await playlists_load();
        const names = Object.keys(playlists);

        if (names.length === 0) {
            alert(t('noPlaylistsAvailable', "No playlists available. Please create a playlist first."));
            return;
        }

        const choice = prompt(
            t('addToWhichPlaylist', "Add to which playlist?") + "\n" +
            names.map((n, i) => `${i + 1}. ${n}`).join("\n"),
            "1"
        );

        if (!choice) return;

        const index = parseInt(choice, 10) - 1;
        if (index < 0 || index >= names.length) {
            alert(t('invalidSelection', "Invalid selection."));
            return;
        }

        const selectedName = names[index];
        const items = playableFiles.map(f => ({
            name: f.name,
            path: `indexeddb://idb/${f.folder}/${f.name}`
        }));

        playlists[selectedName].push(...items);
        await playlists_save(playlists);
        alert(`${t('addedFilesToPlaylist', 'Added {count} file(s) to playlist').replace('{count}', items.length)} "${selectedName}".`);
    } catch (err) {
        console.error("Failed to add IndexedDB folder to playlist:", err);
        alert(t('failedToAddToPlaylist', "Failed to add files to playlist."));
    }
}

// Export all files from an IndexedDB folder
async function exportIndexedDBFolder(folderName) {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
    try {
        const files = await idb_getFilesInFolder(folderName);
        if (!files || files.length === 0) {
            alert(`${t('noFilesInFolder', 'No files found in folder')} "${folderName}".`);
            return;
        }

        const ok = confirm(t('exportFilesConfirm', 'Export {count} file(s)?').replace('{count}', files.length));
        if (!ok) return;

        let exported = 0;
        for (const fileEntry of files) {
            try {
                const url = URL.createObjectURL(fileEntry.blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = fileEntry.name;
                a.click();
                URL.revokeObjectURL(url);
                ++exported;
                // Small delay between downloads
                await new Promise(r => setTimeout(r, 100));
            } catch (err) {
                console.warn("Failed to export:", fileEntry.name, err);
            }
        }

        alert(t('exportedFiles', 'Exported {count} file(s).').replace('{count}', exported));
    } catch (err) {
        console.error("Failed to export IndexedDB folder:", err);
        alert(t('failedToExport', "Failed to export files."));
    }
}

// Initialize IndexedDB on load
idb_init().catch(err => console.warn("IndexedDB init failed:", err));

// ============================================================
// Utility: escape HTML to prevent XSS
// ============================================================
function escapeHTML(str) {
    if (typeof str !== "string") return "";
    return str.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[c]);
}

// ============================================================
// Utility: check if a directory exists under a parent handle
// ============================================================
async function dirExists(name, parentHandle) {
    try {
        await parentHandle.getDirectoryHandle(name, { create: false });
        return true;
    } catch {
        return false;
    }
}

// ============================================================
// Prompt user for a unique directory name
// ============================================================
async function promptForUniqueName(baseName, parentHandle) {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
    let attempts = 0;

    while (attempts < 3) {
        const name = prompt(
            `${t('directoryExists', 'Directory')} "${baseName}" ${t('alreadyExists', 'already exists.')} ${t('enterNewName', 'Enter a new name (no slashes):')}`,
            baseName
        );

        if (name === null) return null;

        const trimmed = name.trim();
        if (!trimmed || trimmed.includes('/')) {
            alert(t('invalidName', "Invalid name. Directory names must not be empty or contain slashes."));
            return null;
        }

        if (trimmed === baseName) {
            ++attempts;
            alert(`"${baseName}" ${t('alreadyExistsChooseDifferent', 'already exists. Please choose a different name.')}`);
            continue;
        }

        if (!(await dirExists(trimmed, parentHandle))) {
            return trimmed;
        }

        ++attempts;
        alert(`"${trimmed}" ${t('tryAgain', 'already exists. Try again.')}`);
    }

    alert(t('tooManyAttempts', "Too many attempts. Import cancelled."));
    return null;
}

// Media extensions for playlist items
const PLAYLIST_EXTENSIONS = new Set([
    ".mp4", ".webm", ".mkv",
    ".mp3", ".wav", ".flac",
    ".m4a"
]);

// Subtitle extensions
const SUBTITLE_EXTENSIONS = new Set([
    ".vtt"
]);

// Allowed extensions for import (media + subtitles)
const ALLOWED_EXTENSIONS = new Set([
    ...PLAYLIST_EXTENSIONS,
    ...SUBTITLE_EXTENSIONS
]);

function isAllowedFile(name) {
    // Check if file should be imported to storage (media + subtitles)
    try
    {
        if (typeof name !== "string") return false;

        const lower = name.trim().toLowerCase();
        if (!lower) return false;

        const dotIndex = lower.lastIndexOf(".");
        if (dotIndex === -1) return false;

        const ext = lower.slice(dotIndex);

        return ALLOWED_EXTENSIONS.has(ext);
    }
    catch
    {
        return false;
    }
}

function isPlaylistFile(name) {
    // Check if file should be added to playlists (media only)
    try
    {
        if (typeof name !== "string") return false;

        const lower = name.trim().toLowerCase();
        if (!lower) return false;

        const dotIndex = lower.lastIndexOf(".");
        if (dotIndex === -1) return false;

        const ext = lower.slice(dotIndex);

        return PLAYLIST_EXTENSIONS.has(ext);
    }
    catch
    {
        return false;
    }
}

function isSubtitleFile(name) {
    // Check if file is a subtitle file (.vtt)
    try
    {
        if (typeof name !== "string") return false;

        const lower = name.trim().toLowerCase();
        if (!lower) return false;

        const dotIndex = lower.lastIndexOf(".");
        if (dotIndex === -1) return false;

        const ext = lower.slice(dotIndex);

        return SUBTITLE_EXTENSIONS.has(ext);
    }
    catch
    {
        return false;
    }
}

// ============================================================
// Copy a directory (from SAF) into private storage
// ============================================================
async function copyDirectoryToPrivateStorage(sourceHandle, targetHandle, result = { count: 0, errors: [] }) {
    for await (const [name, handle] of sourceHandle.entries()) {
        try {
            if (handle.kind === "file") {
                if (!isAllowedFile(name))
                {
                    continue;
                }
                // SAF read (may fail on Android)
                // Chromium Recent BUG on Android? for handle.getFile() silent fails.
                // GrapheneOS
                // No longer working on Microsoft Edge and Vadadium. Why?
                // Same issue happens for snaeplayer
                // https://github.com/minht11/local-music-pwa/issues/76
                const file = await handle.getFile();

                let writable = null;
                try {
                    const targetFileHandle = await targetHandle.getFileHandle(name, { create: true });
                    writable = await targetFileHandle.createWritable();
                    await writable.write(file);
                    ++result.count;
                } finally {
                    if (writable) await writable.close();
                }

            } else if (handle.kind === "directory") {
                let newDirHandle;
                try {
                    newDirHandle = await targetHandle.getDirectoryHandle(name, { create: true });
                } catch (err) {
                    result.errors.push(`Failed to create directory '${name}': ${err.message}`);
                    continue;
                }

                await copyDirectoryToPrivateStorage(handle, newDirHandle, result);
            }

        } catch (err) {
            result.errors.push(`Failed to copy '${name}': ${err.message}`);
        }

        // Yield to avoid UI freeze
        await new Promise(requestAnimationFrame);
    }

    return result;
}

// ============================================================
// Collect all file pointers recursively under a directory
// ============================================================
async function collectPointers(dirHandle, schema, basePath) {
    const result = [];

    for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === "file") {

            // Skip non-playlist files (media only, no subtitles)
            if (!isPlaylistFile(name)) continue;

            result.push({
                name,
                path: `${schema}://${basePath}/${name}`
            });
        } else if (handle.kind === "directory") {
            const subPath = `${basePath}/${name}`;
            const subPointers = await collectPointers(handle, schema, subPath);
            result.push(...subPointers);
        }
    }

    return result;
}

// ============================================================
// Add all pointers from a directory (any root) to a playlist
// ============================================================
async function addDirectoryToPlaylist(rootDirHandle, schema, rootName, dirPath, playlistName) {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
    try {
        let targetDir;

        if (schema === "navigator_storage") {
            // navigator_storage: rootDirHandle is a real directory handle
            // dirPath might be nested like "MyMusic/Album1"
            const parts = dirPath.split("/");
            targetDir = rootDirHandle;
            for (const part of parts) {
                targetDir = await targetDir.getDirectoryHandle(part, { create: false });
            }

        } else if (schema === "external_storage") {
            // external_storage: rootDirHandle is a map of name → handle
            // dirPath might be nested like "Videos/kanojo"
            const parts = dirPath.split("/");
            const topLevelName = parts[0];

            targetDir = rootDirHandle[topLevelName];

            if (!targetDir) {
                alert(`${t('externalDirNotFound', 'External directory not found')} "${topLevelName}".`);
                return;
            }

            // Ensure permission is granted
            const ok = await verifyPermission(targetDir);
            if (!ok) {
                alert(t('permissionDeniedExternal', "Permission denied for external directory."));
                return;
            }

            // Traverse nested path if any
            for (let i = 1; i < parts.length; ++i) {
                targetDir = await targetDir.getDirectoryHandle(parts[i], { create: false });
            }

        } else {
            alert(t('unknownStorageSchema', "Unknown storage schema."));
            return;
        }

        const basePath = `${rootName}/${dirPath}`;
        const pointers = await collectPointers(targetDir, schema, basePath);

        if (pointers.length === 0) {
            alert(`${t('noFilesInFolder', 'No files found in')} "${dirPath}".`);
            return;
        }

        const playlists = await playlists_load();
        if (!playlists[playlistName]) {
            playlists[playlistName] = [];
        }

        playlists[playlistName].push(...pointers);
        await playlists_save(playlists);

        alert(t('addedFilesToPlaylist', 'Added {count} file(s) to playlist').replace('{count}', pointers.length) + ` "${playlistName}".`);
    } catch (err) {
        console.error(err);
        alert(t('failedToAddToPlaylist', "Failed to add directory to playlist."));
    }
}

// ============================================================
// Choose playlist and add directory contents
// ============================================================
async function choosePlaylistAndAdd(rootDirHandle, entry, dirName) {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
    const playlists = await playlists_load();
    const names = Object.keys(playlists);

    const choice = prompt(
        t('addToWhichPlaylist', "Add to which playlist?") + "\n" +
        names.map((n, i) => `${i + 1}. ${n}`).join("\n"),
        "1"
    );

    if (!choice) return;

    const index = parseInt(choice, 10) - 1;
    if (index < 0 || index >= names.length) {
        alert(t('invalidSelection', "Invalid selection"));
        return;
    }

    const selectedName = names[index];

    await addDirectoryToPlaylist(
        rootDirHandle,
        entry.schema,
        entry.rootName,
        dirName,
        selectedName
    );
}

// Export/Download files from a directory
async function exportDirectory(entry, dirPath, parent) {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
    try {
        let targetDir;

        // Navigate to the target directory
        if (entry.schema === "navigator_storage") {
            const parts = dirPath.split("/");
            targetDir = parent;
            for (const part of parts) {
                targetDir = await targetDir.getDirectoryHandle(part, { create: false });
            }
        } else if (entry.schema === "external_storage") {
            const parts = dirPath.split("/");
            const topLevelName = parts[0];
            targetDir = parent[topLevelName];

            if (!targetDir) {
                alert(`${t('externalDirNotFound', 'External directory not found')} "${topLevelName}".`);
                return;
            }

            // Ensure permission
            const ok = await verifyPermission(targetDir);
            if (!ok) {
                alert(t('permissionDeniedExternal', "Permission denied for external directory."));
                return;
            }

            // Traverse nested path
            for (let i = 1; i < parts.length; ++i) {
                targetDir = await targetDir.getDirectoryHandle(parts[i], { create: false });
            }
        } else {
            alert(t('unknownStorageSchema', "Unknown storage schema."));
            return;
        }

        // Collect all files recursively
        const files = await collectFilesForExport(targetDir, "");

        if (files.length === 0) {
            alert(t('noFilesToExport', "No files found to export."));
            return;
        }

        // Ask user confirmation
        const ok = confirm(`${t('exportAllFilesFrom', 'Export all files from')} "${dirPath}"?\n\n${t('foundFiles', 'Found {count} file(s).').replace('{count}', files.length)}`);
        if (!ok) return;

        // Download each file
        let downloaded = 0;
        for (const file of files) {
            try {
                const blob = await file.handle.getFile();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = file.name;
                a.click();
                URL.revokeObjectURL(url);
                ++downloaded;
                // Small delay between downloads
                await new Promise(r => setTimeout(r, 100));
            } catch (err) {
                console.warn("Failed to export:", file.name, err);
            }
        }

        alert(t('exportedFiles', 'Exported {count} file(s).').replace('{count}', downloaded));

    } catch (err) {
        console.error(err);
        alert(t('failedToExportDirectory', "Failed to export directory."));
    }
}

// Collect all files in a directory recursively for export
async function collectFilesForExport(dirHandle, basePath) {
    const files = [];

    for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === "file") {
            files.push({
                name: basePath ? `${basePath}/${name}` : name,
                handle: handle
            });
        } else if (handle.kind === "directory") {
            const subPath = basePath ? `${basePath}/${name}` : name;
            const subFiles = await collectFilesForExport(handle, subPath);
            files.push(...subFiles);
        }
    }

    return files;
}

// ============================================================
// Helper: position menu within viewport boundaries
// ============================================================
let _menuCounter = 0;

window.positionMenu = function(menu, button) {
    // Ensure button has a unique ID for comparison
    if (!button.dataset.menuTriggerId) {
        button.dataset.menuTriggerId = "menuTrigger_" + (++_menuCounter);
    }
    const triggerId = button.dataset.menuTriggerId;

    // Check if there's already an open menu from this button
    const existing = document.querySelector(".context-menu");
    if (existing) {
        const existingTriggerId = existing.dataset.triggerId;
        // Same button clicked - close menu and don't create new one
        if (existingTriggerId === triggerId) {
            existing.remove();
            return false;
        }
        // Different button - close old menu, create new one
        existing.remove();
    }

    // Store trigger ID on menu for comparison
    menu.dataset.triggerId = triggerId;
    menu.style.visibility = "hidden";
    menu.style.position = "fixed";
    document.body.appendChild(menu);

    const btnRect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();

    // Calculate available space
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Try positioning to the left of the button first
    let left = btnRect.left - menuRect.width;
    let top = btnRect.top;

    // If menu goes off left edge, try right side
    if (left < 0) {
        left = btnRect.right;
    }

    // If menu goes off right edge, position at left edge of viewport
    if (left + menuRect.width > viewportWidth) {
        left = 0;
    }

    // Check bottom boundary - if menu goes below viewport, position above button
    if (top + menuRect.height > viewportHeight) {
        top = btnRect.top - menuRect.height;
    }

    // If still goes above viewport, position at bottom of viewport
    if (top < 0) {
        top = viewportHeight - menuRect.height;
    }

    menu.style.left = left + "px";
    menu.style.top = top + "px";
    menu.style.visibility = "visible";

    // Auto-close handler - close on outside click (not on trigger button)
    const closeHandler = (e) => {
        // Don't close if clicking the trigger button (positionMenu handles toggle)
        if (e.target === button || button.contains(e.target)) {
            return;
        }
        // Close if click is outside menu
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener("click", closeHandler, true);
        }
    };
    // Use capture phase to catch clicks
    document.addEventListener("click", closeHandler, true);

    return true; // Menu was created
};

function showStorageDirMenu(entry, dirName, button) {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;

    // Determine which menu items to show
    const isRoot = !dirName;
    const isTopLevel = dirName && !dirName.includes("/");

    const menuItems = [];

    if (!isRoot) {
        menuItems.push(`<div class="menu-item" data-action="add">${t('addToPlaylist', 'Add to Playlist')}</div>`);
        menuItems.push(`<div class="menu-item" data-action="export">${t('export', 'Export')}</div>`);
        // Only show rename if both allowModification and allowFolderRename are true
        if (entry.allowModification && entry.allowFolderRename !== false) {
            menuItems.push(`<div class="menu-item" data-action="rename">${t('rename', 'Rename')}</div>`);
        }
    }
    // Show delete/remove for root or top-level (always allowed), or nested folders with allowModification
    const canRemoveEntry = !dirName || isTopLevel;
    const canDeleteContent = entry.allowModification && !isRoot && !isTopLevel;

    if (canRemoveEntry || canDeleteContent) {
        // Use "Remove entry" label when useRemoveLabel is true, otherwise "Delete"
        const deleteLabel = canRemoveEntry && entry.useRemoveLabel
            ? (isRoot ? t('removeAllEntries', 'Remove all entries') : t('removeEntry', 'Remove entry'))
            : t('delete', 'Delete');
        menuItems.push(`<div class="menu-item danger" data-action="delete">${deleteLabel}</div>`);
    }
    menuItems.push(`<div class="menu-item" data-action="properties">${t('properties', 'Properties')}</div>`);
    menuItems.push(`<div class="menu-item" data-action="close">${t('close', 'Close')}</div>`);

    const menu = document.createElement("div");
    menu.className = "context-menu";

    menu.innerHTML = menuItems.join("");

    if (!positionMenu(menu, button)) return;

    const closeMenu = () => menu.remove();

    // Menu actions
    menu.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", async () => {
            const action = item.dataset.action;

            let parent;

            if (entry.schema === "navigator_storage") {
                const root = await navigator.storage.getDirectory();
                parent = await root.getDirectoryHandle(entry.dirName);
            }
            else if (entry.schema === "external_storage") {
                parent = await loadExternalDirs();
            }
            else if (entry.schema === "indexeddb") {
                // IndexedDB has no parent directory, use idb functions directly
                parent = null;
            }
            else {
                alert(t('unknownStorageSchema', "Unknown storage schema."));
                return;
            }

            if (action === "add") {
                if (entry.schema === "indexeddb") {
                    // Add all files from IndexedDB folder to playlist
                    await addIndexedDBFolderToPlaylist(dirName);
                } else {
                    await choosePlaylistAndAdd(parent, entry, dirName);
                }
            }

            if (action === "export") {
                if (entry.schema === "indexeddb") {
                    await exportIndexedDBFolder(dirName);
                } else {
                    await exportDirectory(entry, dirName, parent);
                }
            }

            if (action === "rename") {
                if (entry.schema === "indexeddb") {
                    alert(t('renameNotAvailable', "Rename not available for IndexedDB."));
                } else {
                    // For nested paths, get just the folder name
                    const parts = dirName.split("/");
                    const oldName = parts.pop();
                    const pathToParent = parts.join("/");

                    const newName = prompt(t('newFolderName', "New folder name:"), oldName);
                    if (newName && newName.trim() && newName.trim() !== oldName) {
                        const trimmed = newName.trim();

                        // Navigate to the parent directory
                        let targetParent = parent;
                        for (const part of pathToParent.split("/").filter(p => p)) {
                            targetParent = await targetParent.getDirectoryHandle(part);
                        }

                        const sourceDir = await targetParent.getDirectoryHandle(oldName);
                        const destDir = await targetParent.getDirectoryHandle(trimmed, { create: true });
                        await copyDirectoryToPrivateStorage(sourceDir, destDir);
                        await targetParent.removeEntry(oldName, { recursive: true });
                    }
                }
            }

            if (action === "delete") {
                const isTopLevel = dirName && !dirName.includes("/");
                const isEntryRemoval = entry.useRemoveLabel && (!dirName || isTopLevel);

                let confirmMsg;
                if (entry.schema === "indexeddb") {
                    confirmMsg = dirName
                        ? `${t('deleteFolderConfirm', 'Delete folder')} "${dirName}"?`
                        : t('deleteAllFilesConfirm', "Delete all files from storage?");
                } else if (isEntryRemoval) {
                    // Entry removal - only remove reference, not actual files
                    confirmMsg = dirName
                        ? `${t('removeEntry', 'Remove entry')} "${dirName}"?\n\n${t('removeEntryNote', 'Note: The actual folder on your device will NOT be deleted.')}`
                        : `${t('removeAllEntries', 'Remove all entries')} "${entry.rootName}"?\n\n${t('removeAllEntriesNote', 'Note: The actual folders on your device will NOT be deleted.')}`;
                } else {
                    confirmMsg = dirName
                        ? `${t('deleteFolderConfirm', 'Delete folder')} "${dirName}"?`
                        : `${t('deleteEntireStorage', 'Delete entire storage')} "${entry.rootName}"?`;
                }

                if (confirm(confirmMsg)) {
                    if (entry.schema === "indexeddb") {
                        if (dirName) {
                            // Delete a specific IndexedDB folder
                            await idb_deleteFolder(dirName);
                        } else {
                            // Delete all IndexedDB files
                            await idb_clearAll();
                        }
                    } else if (isEntryRemoval && entry.schema === "external_storage") {
                        if (dirName) {
                            // Remove just this external directory reference
                            const dirs = await loadExternalDirs();
                            delete dirs[dirName];
                            await kv_set("external_dirs", dirs);
                            window.externalStorageRoot = dirs;
                        } else {
                            // Remove all external directory references
                            await kv_delete("external_dirs");
                            window.externalStorageRoot = {};
                        }
                    } else {
                        // navigator_storage - delete actual folder from OPFS
                        const root = await navigator.storage.getDirectory();
                        if (dirName) {
                            // Navigate through nested path to find the parent directory
                            const parts = dirName.split("/");
                            const folderToDelete = parts.pop();
                            let targetParent = await root.getDirectoryHandle(entry.dirName);

                            // Traverse to the parent of the folder to delete
                            for (const part of parts) {
                                targetParent = await targetParent.getDirectoryHandle(part);
                            }

                            await targetParent.removeEntry(folderToDelete, { recursive: true });
                        } else {
                            // Delete the entire root folder (e.g., imports, files)
                            await root.removeEntry(entry.dirName, { recursive: true });
                        }
                    }
                }
            }

            if (action === "properties") {
                const fullPath = dirName
                    ? `${entry.schema}://${entry.rootName}/${dirName}`
                    : `${entry.schema}://${entry.rootName}`;
                const displayName = dirName ? dirName.split("/").pop() : entry.rootName;

                let info;

                // Count files in directory
                let fileCount = 0;
                let totalSize = 0;
                try {
                    if (entry.schema === "indexeddb") {
                        // IndexedDB - list files and count
                        const idbFiles = await idb_listFiles();
                        fileCount = idbFiles.length;
                        for (const f of idbFiles) {
                            totalSize += f.blob.size;
                        }
                        info = [
                            `${t('directoryName', 'Storage Name')}: ${displayName}`,
                            `${t('fullPath', 'Full Path')}: ${fullPath}`
                        ];
                    } else {
                        let targetDir;
                        if (entry.schema === "navigator_storage") {
                            const root = await navigator.storage.getDirectory();
                            targetDir = await root.getDirectoryHandle(entry.dirName);
                            if (dirName) {
                                const parts = dirName.split("/");
                                for (const part of parts) {
                                    targetDir = await targetDir.getDirectoryHandle(part);
                                }
                            }
                        } else if (entry.schema === "external_storage" && dirName) {
                            const dirs = await loadExternalDirs();
                            targetDir = dirs[dirName.split("/")[0]];
                            if (targetDir) {
                                const ok = await verifyPermission(targetDir);
                                if (ok && dirName.includes("/")) {
                                    const parts = dirName.split("/").slice(1);
                                    for (const part of parts) {
                                        targetDir = await targetDir.getDirectoryHandle(part);
                                    }
                                }
                            }
                        }

                        if (targetDir) {
                            const countResult = await countFilesInDir(targetDir);
                            fileCount = countResult.count;
                            totalSize = countResult.size;
                        }
                        info = [
                            `${t('directoryName', 'Directory Name')}: ${displayName}`,
                            `${t('fullPath', 'Full Path')}: ${fullPath}`
                        ];
                    }
                } catch (err) {
                    console.error("Failed to count files:", err);
                    info = [
                        `${t('directoryName', 'Directory Name')}: ${displayName}`,
                        `${t('fullPath', 'Full Path')}: ${fullPath}`
                    ];
                }

                if (fileCount > 0) {
                    const sizeKB = (totalSize / 1024).toFixed(2);
                    const sizeMB = (totalSize / 1048576).toFixed(2);
                    info.push(`${t('fileCount', 'Files')}: ${fileCount}`);
                    info.push(`${t('totalSize', 'Total Size')}: ${totalSize} bytes (${sizeKB} KB / ${sizeMB} MB)`);
                }

                alert(info.join('\n\n'));
            }

            closeMenu();
            renderStorage();
        });
    });
}

// Count files recursively in a directory
async function countFilesInDir(dirHandle) {
    let count = 0;
    let size = 0;

    for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === "file") {
            if (isPlaylistFile(name)) {
                try {
                    const file = await handle.getFile();
                    size += file.size;
                } catch {}
            }
            ++count;
        } else if (handle.kind === "directory") {
            const subResult = await countFilesInDir(handle);
            count += subResult.count;
            size += subResult.size;
        }
    }

    return { count, size };
}
function showStorageFileMenu(entry, name, handle, fullPath, button) {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;

    const isPlayable = isPlaylistFile(name);
    const isSubtitle = isSubtitleFile(name);

    const menuItems = [];

    if (isPlayable) {
        menuItems.push(`<div class="menu-item" data-action="play">${t('playThis', 'Play')}</div>`);
        menuItems.push(`<div class="menu-item" data-action="play-keep-open">${t('playKeepPanel', 'Play (keep panel open)')}</div>`);
        menuItems.push(`<div class="menu-item" data-action="add">${t('addToPlaylist', 'Add to Playlist')}</div>`);
    }
    if (isSubtitle) {
        menuItems.push(`<div class="menu-item" data-action="load-subtitle">📝 ${t('loadSubtitles', 'Load Subtitles')}</div>`);
    }
    menuItems.push(`<div class="menu-item" data-action="export">${t('export', 'Export')}</div>`);
    if (entry.allowFileRename !== false) {
        menuItems.push(`<div class="menu-item" data-action="rename">${t('rename', 'Rename')}</div>`);
    }
    if (entry.allowModification) {
        menuItems.push(`<div class="menu-item danger" data-action="delete">${t('delete', 'Delete')}</div>`);
    }
    menuItems.push(`<div class="menu-item" data-action="properties">${t('properties', 'Properties')}</div>`);
    menuItems.push(`<div class="menu-item" data-action="close">${t('close', 'Close')}</div>`);

    const menu = document.createElement("div");
    menu.className = "context-menu";

    menu.innerHTML = menuItems.join("");

    if (!positionMenu(menu, button)) return;

    const closeMenu = () => menu.remove();

    // Menu actions
    menu.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", async () => {
            const action = item.dataset.action;

            if (action === "play") {
                if (isPlaylistFile(name)) {
                    const entryPath = `${entry.schema}://${entry.rootName}/${fullPath}`;
                    await play_source(handle, { entryPath });
                    closeActiveView();
                } else {
                    alert(t('fileCannotBePlayed', "This file type cannot be played directly."));
                }
                closeMenu();
                return;
            }

            if (action === "play-keep-open") {
                if (isPlaylistFile(name)) {
                    const entryPath = `${entry.schema}://${entry.rootName}/${fullPath}`;
                    await play_source(handle, { entryPath });
                } else {
                    alert(t('fileCannotBePlayed', "This file type cannot be played directly."));
                }
                closeMenu();
                return;
            }

            if (action === "add") {
                if (!isPlaylistFile(name)) {
                    alert(t('fileCannotBeAdded', "This file type cannot be added to playlist."));
                    closeMenu();
                    return;
                }

                const playlists = await playlists_load();
                const names = Object.keys(playlists);

                const choice = prompt(
                    t('addToWhichPlaylist', "Add to which playlist?") + "\n" +
                    names.map((n, i) => `${i + 1}. ${n}`).join("\n"),
                    "1"
                );

                if (choice) {
                    const index = parseInt(choice, 10) - 1;
                    if (index >= 0 && index < names.length) {
                        const selectedName = names[index];
                        const path = `${entry.schema}://${entry.rootName}/${fullPath}`;
                        playlists[selectedName].push({ name, path });
                        await playlists_save(playlists);
                        alert(`${t('addedToPlaylistSuccess', 'Added')} "${name}" ${t('toPlaylist', 'to playlist')} "${selectedName}".`);
                    }
                }
                closeMenu();
                return;
            }

            if (action === "load-subtitle") {
                if (typeof window.loadSubtitle === 'function') {
                    try {
                        await window.loadSubtitle(handle);
                        alert(`${t('subtitleLoaded', 'Subtitle')} "${name}" ${t('loaded', 'loaded.')}`);
                    } catch (err) {
                        console.error("Failed to load subtitle:", err);
                        alert(t('failedToLoadSubtitle', "Failed to load subtitle."));
                    }
                } else {
                    alert(t('subtitleNotAvailable', "Subtitle loading not available."));
                }
                closeMenu();
                return;
            }

            if (action === "export") {
                try {
                    const file = await handle.getFile();
                    const url = URL.createObjectURL(file);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = name;
                    a.click();
                    URL.revokeObjectURL(url);
                } catch (err) {
                    console.error("Failed to export file:", err);
                    alert(t('failedToExport', "Failed to export file."));
                }
            }

            if (action === "properties") {
                const entryPath = `${entry.schema}://${entry.rootName}/${fullPath}`;
                let info = [
                    `${t('fileName', 'File Name')}: ${name}`,
                    `${t('fullPath', 'Full Path')}: ${entryPath}`
                ];
                try {
                    const file = await handle.getFile();
                    const size = file.size;
                    const sizeKB = (size / 1024).toFixed(2);
                    const sizeMB = (size / 1048576).toFixed(2);
                    const lastModified = new Date(file.lastModified).toISOString();
                    info.push(`${t('size', 'Size')}: ${size} bytes (${sizeKB} KB / ${sizeMB} MB)`);
                    info.push(`${t('type', 'Type')}: ${file.type || 'Unknown'}`);
                    info.push(`${t('lastModified', 'Last Modified')}: ${lastModified}`);
                } catch (err) {
                    console.error("Failed to get file properties:", err);
                }
                alert(info.join('\n\n'));
            }

            const canModify = entry.allowModification;

            if (action === "rename" && canModify) {
                const newName = prompt(t('newFileName', "New file name:"), name);
                if (newName && newName.trim() && newName.trim() !== name) {
                    const trimmed = newName.trim();
                    let writable = null;
                    try {
                        let parent;

                        if (entry.schema === "navigator_storage") {
                            const parts = fullPath.split("/");
                            parts.pop();
                            const parentPath = parts.join("/");

                            const root = await navigator.storage.getDirectory();
                            parent = await root.getDirectoryHandle(entry.dirName);

                            for (const part of parentPath.split("/").filter(p => p)) {
                                parent = await parent.getDirectoryHandle(part);
                            }
                        } else if (entry.schema === "external_storage") {
                            return;
                        }

                        // Read old file
                        const oldFile = await handle.getFile();
                        const newHandle = await parent.getFileHandle(trimmed, { create: true });
                        writable = await newHandle.createWritable();
                        await writable.write(await oldFile.arrayBuffer());
                        await writable.close();
                        writable = null;

                        // Delete old file
                        await parent.removeEntry(name);

                        renderStorage();
                    } catch (err) {
                        console.error("Rename failed:", err);
                        alert(t('failedToRename', "Failed to rename file."));
                    } finally {
                        if (writable) await writable.close();
                    }
                }
            }

            if (action === "delete" && canModify) {
                const ok = confirm(`${t('deleteFileConfirm', 'Delete file')} "${name}"?`);
                if (ok) {
                    try {
                        let parent;

                        if (entry.schema === "navigator_storage") {
                            const parts = fullPath.split("/");
                            parts.pop();
                            const parentPath = parts.join("/");

                            const root = await navigator.storage.getDirectory();
                            parent = await root.getDirectoryHandle(entry.dirName);

                            for (const part of parentPath.split("/").filter(p => p)) {
                                parent = await parent.getDirectoryHandle(part);
                            }
                        } else if (entry.schema === "external_storage") {
                            return;
                        }

                        await parent.removeEntry(name);
                        renderStorage();
                    } catch (err) {
                        console.error("Delete failed:", err);
                        alert(t('failedToDelete', "Failed to delete file."));
                    }
                }
            }

            closeMenu();
        });
    });
}

function renderFileItem(subList, name, handle, entry, currentPath = "") {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
    const li = document.createElement("li");
    li.className = "storage-file-item";

    const fullPath = currentPath ? `${currentPath}/${name}` : name;

    const isPlayable = isPlaylistFile(name);
    const isSubtitle = isSubtitleFile(name);

    li.innerHTML = `
        <div class="storage-file-header">
            <span class="file-name">📄 ${escapeHTML(name)}</span>
            <div class="file-actions">
                ${isPlayable ? '<button class="file-play" title="Play">▶</button>' : ''}
                ${isSubtitle ? '<button class="file-subtitle" title="Load Subtitle">📝</button>' : ''}
                <button class="file-menu" title="Menu">⋮</button>
            </div>
        </div>
    `;

    // Play button (only for playable files)
    if (isPlayable) {
        li.querySelector(".file-play").addEventListener("click", async (e) => {
            e.stopPropagation();
            // Build the proper path for subtitle auto-load
            const entryPath = `${entry.schema}://${entry.rootName}/${fullPath}`;
            await play_source(handle, { entryPath });
            if (typeof isAutoHidePanelEnabled === 'function' && isAutoHidePanelEnabled()) {
                closeActiveView();
            }
        });
    }

    // Subtitle button (only for subtitle files)
    if (isSubtitle) {
        li.querySelector(".file-subtitle").addEventListener("click", async (e) => {
            e.stopPropagation();
            if (typeof window.loadSubtitle === 'function') {
                try {
                    await window.loadSubtitle(handle);
                    alert(`${t('subtitleLoaded', 'Subtitle')} "${name}" ${t('loaded', 'loaded.')}`);
                } catch (err) {
                    console.error("Failed to load subtitle:", err);
                    alert(t('failedToLoadSubtitle', "Failed to load subtitle."));
                }
            } else {
                alert(t('subtitleNotAvailable', "Subtitle loading not available."));
            }
        });
    }

    // Burger menu button
    li.querySelector(".file-menu").addEventListener("click", (e) => {
        e.stopPropagation();
        showStorageFileMenu(entry, name, handle, fullPath, e.currentTarget);
    });

    subList.appendChild(li);
}

// ============================================================
// Render IndexedDB file item
// ============================================================
function renderIndexedDBFileItem(subList, name, fileEntry, entry, folderPath = "") {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
    const li = document.createElement("li");
    li.className = "storage-file-item";

    const isPlayable = isPlaylistFile(name);
    const isSubtitle = isSubtitleFile(name);

    // Build full path: indexeddb://idb/folder/filename.ext
    const fullPath = folderPath ? `${folderPath}/${name}` : name;
    const entryPath = `indexeddb://idb/${fullPath}`;

    li.innerHTML = `
        <div class="storage-file-header">
            <span class="file-name">📄 ${escapeHTML(name)}</span>
            <div class="file-actions">
                ${isPlayable ? '<button class="file-play" title="Play">▶</button>' : ''}
                ${isSubtitle ? '<button class="file-subtitle" title="Load Subtitle">📝</button>' : ''}
                <button class="file-menu" title="Menu">⋮</button>
            </div>
        </div>
    `;

    // Play button (only for playable files)
    if (isPlayable) {
        li.querySelector(".file-play").addEventListener("click", async (e) => {
            e.stopPropagation();
            try {
                // Create a File object from IndexedDB entry
                const file = new File([fileEntry.blob], fileEntry.name, { type: fileEntry.type || "application/octet-stream" });
                await play_source(file, { entryPath });
                if (typeof isAutoHidePanelEnabled === 'function' && isAutoHidePanelEnabled()) {
                    closeActiveView();
                }
            } catch (err) {
                console.error("Failed to play IndexedDB file:", err);
                alert(t('failedToPlay', "Failed to play file."));
            }
        });
    }

    // Subtitle button (only for subtitle files)
    if (isSubtitle) {
        li.querySelector(".file-subtitle").addEventListener("click", async (e) => {
            e.stopPropagation();
            if (typeof window.loadSubtitle === 'function') {
                try {
                    const file = new File([fileEntry.blob], fileEntry.name, { type: fileEntry.type || "text/vtt" });
                    await window.loadSubtitle(file);
                    alert(`${t('subtitleLoaded', 'Subtitle')} "${name}" ${t('loaded', 'loaded.')}`);
                } catch (err) {
                    console.error("Failed to load subtitle:", err);
                    alert(t('failedToLoadSubtitle', "Failed to load subtitle."));
                }
            } else {
                alert(t('subtitleNotAvailable', "Subtitle loading not available."));
            }
        });
    }

    // Burger menu button
    li.querySelector(".file-menu").addEventListener("click", (e) => {
        e.stopPropagation();
        showIndexedDBFileMenu(entry, name, fileEntry, e.currentTarget, folderPath);
    });

    subList.appendChild(li);
}

// ============================================================
// Show menu for IndexedDB file
// ============================================================
function showIndexedDBFileMenu(entry, name, fileEntry, button, folderPath = "") {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;

    const isPlayable = isPlaylistFile(name);
    const isSubtitle = isSubtitleFile(name);

    // Build full path
    const fullPath = folderPath ? `${folderPath}/${name}` : name;
    const entryPath = `indexeddb://idb/${fullPath}`;

    const menuItems = [];

    if (isPlayable) {
        menuItems.push(`<div class="menu-item" data-action="play">${t('playThis', 'Play')}</div>`);
        menuItems.push(`<div class="menu-item" data-action="play-keep-open">${t('playKeepPanel', 'Play (keep panel open)')}</div>`);
        menuItems.push(`<div class="menu-item" data-action="add">${t('addToPlaylist', 'Add to Playlist')}</div>`);
    }
    if (isSubtitle) {
        menuItems.push(`<div class="menu-item" data-action="load-subtitle">📝 ${t('loadSubtitles', 'Load Subtitles')}</div>`);
    }
    menuItems.push(`<div class="menu-item" data-action="export">${t('export', 'Export')}</div>`);
    if (entry.allowFileRename !== false) {
        menuItems.push(`<div class="menu-item" data-action="rename">${t('rename', 'Rename')}</div>`);
    }
    if (entry.allowModification) {
        menuItems.push(`<div class="menu-item danger" data-action="delete">${t('delete', 'Delete')}</div>`);
    }
    menuItems.push(`<div class="menu-item" data-action="properties">${t('properties', 'Properties')}</div>`);
    menuItems.push(`<div class="menu-item" data-action="close">${t('close', 'Close')}</div>`);

    const menu = document.createElement("div");
    menu.className = "context-menu";

    menu.innerHTML = menuItems.join("");

    if (!positionMenu(menu, button)) return;

    const closeMenu = () => menu.remove();

    // Menu actions
    menu.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", async () => {
            const action = item.dataset.action;

            if (action === "play" || action === "play-keep-open") {
                if (isPlaylistFile(name)) {
                    try {
                        const file = new File([fileEntry.blob], fileEntry.name, { type: fileEntry.type || "application/octet-stream" });
                        await play_source(file, { entryPath });
                        if (action === "play") {
                            closeActiveView();
                        }
                    } catch (err) {
                        console.error("Failed to play IndexedDB file:", err);
                        alert(t('failedToPlay', "Failed to play file."));
                    }
                } else {
                    alert(t('fileCannotBePlayed', "This file type cannot be played directly."));
                }
                closeMenu();
                return;
            }

            if (action === "add") {
                if (!isPlaylistFile(name)) {
                    alert(t('fileCannotBeAdded', "This file type cannot be added to playlist."));
                    closeMenu();
                    return;
                }

                const playlists = await playlists_load();
                const names = Object.keys(playlists);

                const choice = prompt(
                    t('addToWhichPlaylist', "Add to which playlist?") + "\n" +
                    names.map((n, i) => `${i + 1}. ${n}`).join("\n"),
                    "1"
                );

                if (choice) {
                    const index = parseInt(choice, 10) - 1;
                    if (index >= 0 && index < names.length) {
                        const selectedName = names[index];
                        playlists[selectedName].push({ name, path: entryPath });
                        await playlists_save(playlists);
                        alert(`${t('addedToPlaylistSuccess', 'Added')} "${name}" ${t('toPlaylist', 'to playlist')} "${selectedName}".`);
                    }
                }
                closeMenu();
                return;
            }

            if (action === "load-subtitle") {
                if (typeof window.loadSubtitle === 'function') {
                    try {
                        const file = new File([fileEntry.blob], fileEntry.name, { type: fileEntry.type || "text/vtt" });
                        await window.loadSubtitle(file);
                        alert(`${t('subtitleLoaded', 'Subtitle')} "${name}" ${t('loaded', 'loaded.')}`);
                    } catch (err) {
                        console.error("Failed to load subtitle:", err);
                        alert(t('failedToLoadSubtitle', "Failed to load subtitle."));
                    }
                } else {
                    alert(t('subtitleNotAvailable', "Subtitle loading not available."));
                }
                closeMenu();
                return;
            }

            if (action === "export") {
                try {
                    const url = URL.createObjectURL(fileEntry.blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = name;
                    a.click();
                    URL.revokeObjectURL(url);
                } catch (err) {
                    console.error("Failed to export file:", err);
                    alert(t('failedToExport', "Failed to export file."));
                }
            }

            if (action === "properties") {
                const size = fileEntry.blob.size;
                const sizeKB = (size / 1024).toFixed(2);
                const sizeMB = (size / 1048576).toFixed(2);
                const lastModified = new Date(fileEntry.lastModified).toISOString();
                let info = [
                    `${t('fileName', 'File Name')}: ${name}`,
                    `${t('fullPath', 'Full Path')}: ${entryPath}`,
                    `${t('size', 'Size')}: ${size} bytes (${sizeKB} KB / ${sizeMB} MB)`,
                    `${t('type', 'Type')}: ${fileEntry.type || 'Unknown'}`,
                    `${t('lastModified', 'Last Modified')}: ${lastModified}`
                ];
                alert(info.join('\n\n'));
            }

            if (action === "rename" && entry.allowModification) {
                const newName = prompt(t('newFileName', "New file name:"), name);
                if (newName && newName.trim() && newName.trim() !== name) {
                    const trimmed = newName.trim();
                    try {
                        // Delete old entry
                        await idb_deleteFile(fileEntry.path);
                        // Put new entry with new name
                        await idb_putFile(fileEntry.folder, trimmed, fileEntry.blob, fileEntry.type);
                        renderStorage();
                    } catch (err) {
                        console.error("Rename failed:", err);
                        alert(t('failedToRename', "Failed to rename file."));
                    }
                }
            }

            if (action === "delete" && entry.allowModification) {
                const ok = confirm(`${t('deleteFileConfirm', 'Delete file')} "${name}"?`);
                if (ok) {
                    try {
                        await idb_deleteFile(fileEntry.path);
                        renderStorage();
                    } catch (err) {
                        console.error("Delete failed:", err);
                        alert(t('failedToDelete', "Failed to delete file."));
                    }
                }
            }

            closeMenu();
        });
    });
}

function renderSubdirItem(subList, name, handle, parentHandle, entry, currentPath = "", rootHandle = null) {
    const li = document.createElement("li");
    li.className = "storage-sub-item";

    li.innerHTML = `
        <div class="storage-sub-header">
            <span class="sub-name">📁 ${escapeHTML(name)}</span>
            <div class="sub-actions">
                <button class="sub-menu" title="Menu">⋮</button>
            </div>
        </div>
    `;

    const header = li.querySelector(".storage-sub-header");

    // Full path for this subdirectory
    const fullPath = currentPath ? `${currentPath}/${name}` : name;

    // Root handle is the top-level directory (imports, files, etc.)
    const actualRootHandle = rootHandle || parentHandle;

    // Burger menu button
    li.querySelector(".sub-menu").addEventListener("click", (e) => {
        e.stopPropagation();
        showStorageDirMenu(entry, fullPath, e.currentTarget);
    });

    if (entry.showSubdirs)
    {
        // Click to expand/collapse subdirectories (recursive)
        header.addEventListener("click", async () => {
            const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
            // For external storage, check/request permission first
            if (entry.schema === "external_storage" && handle) {
                const hasPermission = await verifyPermission(handle);
                if (!hasPermission) {
                    alert(t('permissionDenied', "Permission denied for this directory."));
                    return;
                }
            }

            let sub = li.querySelector("ul");
            if (!sub) {
                sub = document.createElement("ul");
                sub.className = "storage-sub hidden";
                li.appendChild(sub);
            }

            const hidden = sub.classList.toggle("hidden");
            if (!hidden) {
                await loadStorageSubdirs(sub, handle, entry, fullPath, actualRootHandle);
            }
        });
    }

    subList.appendChild(li);
}

async function loadStorageSubdirs(subList, dirHandle, entry, currentPath = "", rootHandle = null) {
    // Clear previous content
    subList.innerHTML = "";

    // The root handle is the top-level directory (imports, files, etc.)
    const actualRootHandle = rootHandle || dirHandle;

    // Separate directories and files for sorting
    const dirs = [];
    const files = [];

    // Case 1: IndexedDB (check first since arrays have entries() method)
    if (entry.schema === "indexeddb") {
        if (!currentPath) {
            // Root level - show folder names as directories
            if (Array.isArray(dirHandle)) {
                for (const folderName of dirHandle) {
                    dirs.push({ name: folderName, handle: folderName });
                }
            }
        } else {
            // Inside a folder - show files
            const folderFiles = await idb_getFilesInFolder(currentPath);
            for (const fileEntry of folderFiles) {
                files.push({ name: fileEntry.name, handle: fileEntry });
            }
        }
    }
    // Case 2: navigator_storage → real FileSystemDirectoryHandle
    else if (dirHandle && typeof dirHandle.entries === "function") {
        for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind === "directory") {
                dirs.push({ name, handle });
            } else if (handle.kind === "file") {
                files.push({ name, handle });
            }
        }
    }
    // Case 3: external_storage
    else if (entry.schema === "external_storage" && dirHandle && typeof dirHandle === "object") {
        for (const [name, handle] of Object.entries(dirHandle)) {
            dirs.push({ name, handle });
        }
    }
    else {
        console.warn("Unknown dirHandle type in loadStorageSubdirs:", dirHandle);
        return;
    }

    // Sort directories and files alphabetically
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    // Render directories first
    for (const { name, handle } of dirs) {
        renderSubdirItem(subList, name, handle, dirHandle, entry, currentPath, actualRootHandle);
    }

    // Render files after directories
    for (const { name, handle } of files) {
        if (entry.schema === "indexeddb") {
            renderIndexedDBFileItem(subList, name, handle, entry, currentPath);
        } else {
            renderFileItem(subList, name, handle, entry, currentPath);
        }
    }
}

// ============================================================
// Render all import roots and their subdirectories
// ============================================================
async function renderStorage() {
    const list = document.getElementById("storageList");
    list.innerHTML = "";

    // Ensure root exists
    if (!window.navigatorStorageRoot) {
        window.navigatorStorageRoot = await navigator.storage.getDirectory();
    }

    const root = window.navigatorStorageRoot;

    for (const entry of IMPORT_ROOTS) {
        if (!entry.enabled) continue;

        let rootDir;
        try {
            if (entry.schema === "navigator_storage") {
                rootDir = await root.getDirectoryHandle(entry.dirName);
            } else if (entry.schema === "external_storage") {
                rootDir = await loadExternalDirs();
                // Skip if no external directories exist
                if (!rootDir || Object.keys(rootDir).length === 0) {
                    continue;
                }
            } else if (entry.schema === "indexeddb") {
                // Check if IndexedDB has any files
                const idbFolders = await idb_listFolders();
                if (!idbFolders || idbFolders.length === 0) {
                    continue;
                }
                rootDir = idbFolders; // Array of folder names
            }
            else
            {
                continue;
            }
        } catch (err) {
            // NotFoundError is expected for empty/unused storage roots
            if (err.name !== 'NotFoundError') {
                console.error(`Failed to load ${entry.rootName}:`, err);
            }
            continue; // Skip missing roots
        }
        const li = document.createElement("li");
        li.className = "storage-node";

        li.innerHTML = `
            <div class="storage-header">
                <button class="toggle">+</button>
                <span class="storage-name">${entry.schema}://${entry.rootName}</span>
                <button class="storage-menu" title="Menu">⋮</button>
            </div>
            <ul class="storage-sub hidden"></ul>
        `;

        const header = li.querySelector(".storage-header");
        const toggleBtn = li.querySelector(".toggle");
        const subList = li.querySelector(".storage-sub");
        const menuBtn = li.querySelector(".storage-menu");

        // Click to expand/collapse (but not on menu button)
        header.addEventListener("click", (e) => {
            if (e.target === menuBtn) return;
            const hidden = subList.classList.toggle("hidden");
            toggleBtn.textContent = hidden ? "+" : "−";
            if (!hidden) loadStorageSubdirs(subList, rootDir, entry);
        });

        // Burger menu button
        menuBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            showStorageDirMenu(entry, null, e.currentTarget);
        });

        list.appendChild(li);
    }
}

// ============================================================
// Import directory (showDirectoryPicker)
// ============================================================
document.getElementById("addImportBtn").addEventListener("click", async () => {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
    try {
        const sourceDir = await window.showDirectoryPicker({ startIn: "music" });
        const permission = await verifyPermission(sourceDir);
        if (!permission) return;

        const privateRoot = await navigator.storage.getDirectory();
        const importsDir = await privateRoot.getDirectoryHandle("imports", { create: true });

        let targetName = sourceDir.name;
        if (await dirExists(targetName, importsDir)) {
            targetName = await promptForUniqueName(targetName, importsDir);
            if (!targetName) return;
        }

        const targetDir = await importsDir.getDirectoryHandle(targetName, { create: true });
        const result = await copyDirectoryToPrivateStorage(sourceDir, targetDir);

        renderStorage();

        let message = t('importedFiles', 'Imported {count} file(s).').replace('{count}', result.count);
        if (result.errors.length > 0) {
            message += "\n\n" + result.errors.join("\n");
        }

        alert(message);
    } catch (err) {
        console.warn(err);
    }
});

// ============================================================
// Clear all import roots
// ============================================================
document.getElementById("clearImports").addEventListener("click", async () => {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
    const confirmed = confirm(
        t('clearAllImportsConfirm', "This will permanently delete all imported directories:\n") +
        IMPORT_ROOTS.map(r => `• "${r.dirName}"`).join("\n") +
        "\n\n" + t('clearAllImportsNote', "This will also clear IndexedDB storage.\n\nAre you sure you want to proceed?")
    );
    if (!confirmed) return;

    try {
        const rootDir = await navigator.storage.getDirectory();
        let removedAny = false;

        for (const entry of IMPORT_ROOTS) {
            if (!entry.enabled) continue;

            try {
                if (entry.schema === "external_storage")
                {
                    const externalDirs = window.externalStorageRoot;

                    // Only delete if it exists and contains at least one directory
                    if (externalDirs && Object.keys(externalDirs).length != 0) {
                        await kv_delete("external_dirs");
                        removedAny = true;
                        window.externalStorageRoot = null;
                    }
                    continue;
                }
                else if (entry.schema === "indexeddb")
                {
                    // Clear IndexedDB
                    await idb_clearAll();
                    removedAny = true;
                    continue;
                }
                else
                {
                    await rootDir.removeEntry(entry.dirName, { recursive: true });
                    removedAny = true;
                }
            } catch {
                // ignore missing directories
            }
        }

        alert(removedAny ? t('allImportsRemoved', "All import folders have been removed.") : t('noImportFoldersFound', "No import folders found."));
        renderStorage();
    } catch (err) {
        console.error(err);
        alert(t('failedToClearImports', "Failed to clear imports."));
    }
});

// ============================================================
// Back button
// ============================================================
document.getElementById("backBtn").addEventListener("click", () => {
    closeActiveView();
});

// ============================================================
// File picker import (input type="file")
// ============================================================
document.getElementById("addFilesBtn").addEventListener("click", () => {
    document.getElementById("filePicker").click();
});

document.getElementById("filePicker").addEventListener("change", async (event) => {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const privateRoot = await navigator.storage.getDirectory();
    const filesDir = await privateRoot.getDirectoryHandle("files", { create: true });

    const targetName = "files_" + Date.now();
    const targetDir = await filesDir.getDirectoryHandle(targetName, { create: true });

    let count = 0;
    const errors = [];

    for (const file of files) {
        const filename = file.name;
        if (!filename)
        {
            errors.push(t('failedToImportFile', 'Failed to import a file'));
            continue;
        }
        try {
            if (!isAllowedFile(filename))
            {
                continue;
            }
            const targetFileHandle = await targetDir.getFileHandle(filename, { create: true });
            const writable = await targetFileHandle.createWritable();
            try {
                await writable.write(await file.arrayBuffer());
            } finally {
                await writable.close(); // always close, even on error
            }
            ++count;
        } catch (err) {
            errors.push(`${t('failedToImport', 'Failed to import')} ${filename}: ${err.message}`);
        }
    }

    renderStorage();

    let msg = t('importedFiles', 'Imported {count} file(s).').replace('{count}', count);
    if (errors.length > 0) {
        msg += "\n\n" + errors.join("\n");
    }
    alert(msg);
});

// ============================================================
// Initial render
// ============================================================
renderStorage();

async function loadExternalDirs() {
    if (!window.externalStorageRoot) {
        window.externalStorageRoot = await kv_get("external_dirs") || {};
    }
    return window.externalStorageRoot;
}


document.getElementById("addExternalBtn").addEventListener("click", async () => {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
    try {
        const dir = await window.showDirectoryPicker();
        const ok = await verifyPermission(dir);
        if (!ok) return;

        const name = dir.name;

        // Load existing external dirs
        let dirs = await kv_get("external_dirs") || {};

        // Prevent overwriting an existing entry
        if (dirs[name]) {
            alert(`${t('externalDirAlreadyExists', 'External directory')} "${name}" ${t('alreadyExists', 'already exists.')}`);
            return;
        }

        // Save new entry
        dirs[name] = dir;
        await kv_set("external_dirs", dirs);

        // Update in-memory cache
        window.externalStorageRoot = dirs;

        alert(`${t('externalDirAdded', 'External directory')} "${name}" ${t('added', 'added.')}`);
        renderStorage();

    } catch (err) {
        console.error(err);
        alert(t('failedToImportExternal', "Failed to import external directory."));
    }
});

// ============================================================
// IndexedDB Import Handler (directory picker with file fallback)
// ============================================================
document.getElementById("addIndexedDBBtn").addEventListener("click", async () => {
    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
    try {
        // Create a timestamp-based virtual folder for this import
        const folder = `idb_${Date.now()}`;
        const result = { count: 0, errors: [] };

        // Check if showDirectoryPicker is available
        if (typeof window.showDirectoryPicker === "function") {
            try {
                const sourceDir = await window.showDirectoryPicker({ startIn: "music" });

                // Recursively copy files from directory to IndexedDB
                await copyDirectoryToIndexedDB(sourceDir, folder, result);

                renderStorage();

                let msg = t('importedFilesToIDB', 'Imported {count} file(s) into IndexedDB.').replace('{count}', result.count);
                if (result.errors.length > 0) {
                    msg += "\n\n" + result.errors.join("\n");
                }
                alert(msg);
                return;
            } catch (err) {
                // User cancelled or directory picker failed - fall through to file picker
                if (err.name === 'AbortError') {
                    return; // User cancelled
                }
                console.warn("Directory picker failed, falling back to file picker:", err);
            }
        }

        // Fallback: use file picker
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = Array.from(ALLOWED_EXTENSIONS).join(",");

        input.addEventListener("change", async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;

            for (const file of files) {
                const filename = file.name;
                if (!filename || !isAllowedFile(filename)) {
                    continue;
                }
                try {
                    await idb_putFile(folder, filename, file, file.type || "application/octet-stream");
                    ++result.count;
                } catch (err) {
                    result.errors.push(`Failed to import '${filename}': ${err.message}`);
                }
            }

            renderStorage();

            let msg = t('importedFilesToIDB', 'Imported {count} file(s) into IndexedDB.').replace('{count}', result.count);
            if (result.errors.length > 0) {
                msg += "\n\n" + result.errors.join("\n");
            }
            alert(msg);
        });

        input.click();
    } catch (err) {
        console.warn(err);
    }
});

// Recursively copy files from a directory handle to IndexedDB
async function copyDirectoryToIndexedDB(dirHandle, folder, result) {
    for await (const [name, handle] of dirHandle.entries()) {
        try {
            if (handle.kind === "file") {
                if (!isAllowedFile(name)) {
                    continue;
                }
                const file = await handle.getFile();
                await idb_putFile(folder, name, file, file.type || "application/octet-stream");
                ++result.count;
            } else if (handle.kind === "directory") {
                // Recursively process subdirectories
                await copyDirectoryToIndexedDB(handle, folder, result);
            }
        } catch (err) {
            result.errors.push(`Failed to import '${name}': ${err.message}`);
        }

        // Yield to avoid UI freeze
        await new Promise(requestAnimationFrame);
    }
}

function supportsExternalDirectoryAccess() {
    return typeof window.showDirectoryPicker === "function";
}

function updateImportButtonsVisibility() {
    const btnImportDir = document.getElementById("addImportBtn");
    const btnImportExternal = document.getElementById("addExternalBtn");

    if (!supportsExternalDirectoryAccess()) {
        btnImportDir.style.display = "none";
        btnImportExternal.style.display = "none";
    }
}

updateImportButtonsVisibility();

// Expose IndexedDB functions globally for use by other modules
window.idb_getFile = idb_getFile;
window.idb_listFiles = idb_listFiles;
window.idb_listFolders = idb_listFolders;
