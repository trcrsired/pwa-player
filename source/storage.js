// ============================================================
// Central definition of all import roots inside private storage
// ============================================================
//
// Each entry defines:
// - schema: storage backend (navigator_storage, external_storage, indexeddb, remote_storage)
// - rootName: logical name used in pointer paths
// - dirName: actual directory name inside private storage
// - enabled: allows future toggling or feature flags
// - allowModification: if true, allows delete/rename operations on content
// - useRemoveLabel: if true, use "Remove entry" label instead of "Delete"
// - canPaste: if true, allows pasting files/directories from clipboard
// - canCreateFolder: if true, allows creating new empty folders
//
const IMPORT_ROOTS = [
    {
        schema: "external_storage",
        rootName: "external",
        dirName: "external",
        enabled: true,
        showSubdirs: true,
        allowModification: false,
        allowFolderRename: true,
        allowFileRename: false,
        useRemoveLabel: true,
        canPaste: true,  // External storage supports paste with permission
        canCreateFolder: false  // Would need permission each time, impractical
    },
    {
        schema: "remote_storage",
        rootName: "remote",
        dirName: "remote",
        enabled: true,
        showSubdirs: true,
        allowModification: false,
        allowFolderRename: false,
        allowFileRename: false,
        useRemoveLabel: true,
        canPaste: false,  // Cannot upload to HTTP servers
        canCreateFolder: false  // Cannot create folders on remote servers
    },
    {
        schema: "navigator_storage",
        rootName: "imports",
        dirName: "imports",
        enabled: true,
        showSubdirs: true,
        allowModification: true,
        allowFolderRename: true,
        allowFileRename: true,
        useRemoveLabel: false,
        canPaste: true,
        canCreateFolder: true
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
        useRemoveLabel: false,
        canPaste: true,
        canCreateFolder: true
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
        useRemoveLabel: false,
        canPaste: true,
        canCreateFolder: true
    }
];

// ============================================================
// Clipboard for Copy/Paste between storage types
// ============================================================
let storageClipboard = null; // Stores: { type: 'file'|'dir', source: {...}, name, path/schema }

// ============================================================
// Toast notification for status display
// ============================================================
let toastElement = null;

function showToast(message, duration = 0) {
    if (!toastElement) {
        toastElement = document.createElement("div");
        toastElement.id = "storage-toast";
        toastElement.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 24px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            border-radius: 8px;
            z-index: 10000;
            font-size: 14px;
            max-width: 80vw;
            text-align: center;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        document.body.appendChild(toastElement);
    }
    toastElement.textContent = message;
    toastElement.style.display = "block";

    if (duration > 0) {
        setTimeout(() => hideToast(), duration);
    }
}

function hideToast() {
    if (toastElement) {
        toastElement.style.display = "none";
    }
}

function updateToast(message) {
    if (toastElement && toastElement.style.display === "block") {
        toastElement.textContent = message;
    } else {
        showToast(message);
    }
}

// ============================================================
// Validate storage name - no special characters
// ============================================================
function isValidStorageName(name) {
    if (!name || typeof name !== 'string') return false;
    // Disallow: . / \ : * ? " < > | and control characters
    const invalidChars = /[.\/\\:*?"<>|\x00-\x1f]/;
    return !invalidChars.test(name) && name.trim().length > 0;
}

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
async function addIndexedDBFolderToPlaylist(folderName, tonowplaying) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
    try {
        const files = await idb_getFilesInFolder(folderName);
        if (!files || files.length === 0) {
            alert(`${t('noFilesInFolder', 'No files found in folder')} "${folderName}".`);
            return;
        }

        // Filter to only playable/viewable files
        const playableFiles = files.filter(f => isPlayableOrImageFile(f.name));
        if (playableFiles.length === 0) {
            alert(`${t('noPlayableFiles', 'No playable files found in folder')} "${folderName}".`);
            return;
        }

        if (tonowplaying)
        {
            const items = playableFiles.map(f => ({
                name: f.name,
                path: `indexeddb://idb/${f.folder}/${f.name}`,
                playlistName: f.folder
            }));
            await startNowPlayingFromPlaylistTable(items, 0, null, true);
            return true;
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
        playlist_renderTree();
        alert(`${t('addedFilesToPlaylist', 'Added {count} file(s) to playlist').replace('{count}', items.length)} "${selectedName}".`);
        return true;
    } catch (err) {
        console.error("Failed to add IndexedDB folder to playlist:", err);
        alert(t('failedToAddToPlaylist', "Failed to add files to playlist."));
    }
}

// Export all files from an IndexedDB folder
async function exportIndexedDBFolder(folderName) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
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
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
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
    ".mp4", ".webm", ".mkv", ".mov",
    ".mp3", ".wav", ".flac",
    ".m4a"
]);

// Image extensions for viewing
const IMAGE_EXTENSIONS = new Set([
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".ico", ".avif"
]);

// Subtitle extensions
const SUBTITLE_EXTENSIONS = new Set([
    ".vtt"
]);

// Allowed extensions for import (media + subtitles + images)
const ALLOWED_EXTENSIONS = new Set([
    ...PLAYLIST_EXTENSIONS,
    ...SUBTITLE_EXTENSIONS,
    ...IMAGE_EXTENSIONS
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

function isImageFile(name) {
    // Check if file is an image file
    try
    {
        if (typeof name !== "string") return false;

        const lower = name.trim().toLowerCase();
        if (!lower) return false;

        const dotIndex = lower.lastIndexOf(".");
        if (dotIndex === -1) return false;

        const ext = lower.slice(dotIndex);

        return IMAGE_EXTENSIONS.has(ext);
    }
    catch
    {
        return false;
    }
}

function isPlayableOrImageFile(name) {
    // Check if file can be played or viewed (media + images)
    return isPlaylistFile(name) || isImageFile(name);
}

// Expose isImageFile globally for other modules
window.isImageFile = isImageFile;
window.isPlayableOrImageFile = isPlayableOrImageFile;

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
// Paste a file or directory from clipboard to a destination
// ============================================================
async function pasteToDestination(entry, dirName, parent) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    if (!storageClipboard) {
        alert(t('clipboardEmpty', "Clipboard is empty. Copy a file or directory first."));
        return;
    }

    const { type, name, source } = storageClipboard;

    // Show status toast
    const actionLabel = source.schema === "remote_storage"
        ? t('downloading', 'Downloading')
        : t('copying', 'Copying');
    showToast(`${actionLabel} "${name}"...`);

    // Get destination directory handle based on schema
    let targetDirHandle = null;
    let targetFolderName = null; // For IndexedDB

    try {
        if (entry.schema === "indexeddb") {
            targetFolderName = dirName || `idb_${Date.now()}`;
        } else if (entry.schema === "navigator_storage") {
            const root = await navigator.storage.getDirectory();
            targetDirHandle = await root.getDirectoryHandle(entry.dirName);
            if (dirName) {
                for (const part of dirName.split("/").filter(p => p)) {
                    targetDirHandle = await targetDirHandle.getDirectoryHandle(part, { create: true });
                }
            }
        } else if (entry.schema === "external_storage") {
            const externalDirs = await loadExternalDirs();
            if (!dirName) {
                hideToast();
                alert(t('selectDirectoryFirst', "Please select a specific directory in external storage to paste."));
                return;
            }
            const parts = dirName.split("/");
            const topLevelName = parts[0];
            targetDirHandle = externalDirs[topLevelName];

            if (!targetDirHandle) {
                hideToast();
                alert(`${t('externalDirNotFound', 'External directory not found')}: ${topLevelName}`);
                return;
            }

            // Request permission before pasting
            const hasPermission = await verifyPermission(targetDirHandle);
            if (!hasPermission) {
                hideToast();
                alert(t('permissionDenied', "Permission denied for external directory."));
                return;
            }

            // Navigate to subdirectory
            for (let i = 1; i < parts.length; ++i) {
                targetDirHandle = await targetDirHandle.getDirectoryHandle(parts[i], { create: true });
            }
        } else {
            hideToast();
            alert(t('cannotPasteHere', "Cannot paste to this storage type."));
            return;
        }
    } catch (err) {
        hideToast();
        console.error("Failed to get destination:", err);
        alert(`${t('failedToGetDestination', 'Failed to get destination')}: ${err.message}`);
        return;
    }

    // Perform paste based on type
    const result = { count: 0, errors: [], skipped: 0 };

    if (type === 'file') {
        await pasteSingleFile(source, name, entry.schema, targetDirHandle, targetFolderName, result, updateToast);
    } else if (type === 'dir') {
        await pasteDirectory(source, name, entry.schema, targetDirHandle, targetFolderName, result, updateToast);
    }

    // Hide toast and report result
    hideToast();
    if (result.count > 0) {
        let msg = `${t('pasteSuccess', 'Pasted')} ${result.count} ${t('files', 'file(s)')}`;
        if (result.skipped > 0) {
            msg += `, ${result.skipped} ${t('skipped', 'skipped')}`;
        }
        if (result.errors.length > 0) {
            msg += `\n${t('errors', 'Errors')}: ${result.errors.length}`;
        }
        alert(msg);
        renderStorage();
    } else if (result.skipped > 0) {
        alert(`${t('allFilesSkipped', 'All files skipped (already exist)')}: ${result.skipped}`);
    } else if (result.errors.length > 0) {
        alert(`${t('pasteFailed', 'Paste failed')}: ${result.errors[0]}`);
    }
}

// Paste a single file
async function pasteSingleFile(source, fileName, destSchema, targetDirHandle, targetFolderName, result, statusCallback) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    // Update status
    if (statusCallback) {
        const actionLabel = source.schema === "remote_storage"
            ? t('downloading', 'Downloading')
            : t('copying', 'Copying');
        statusCallback(`${actionLabel}: ${fileName}`);
    }

    // Get source file data
    let sourceFile = null;

    try {
        if (source.schema === "remote_storage") {
            // Download from remote URL
            const response = await fetch(source.handle, { cache: "no-store", mode: "cors" });
            if (!response.ok) {
                result.errors.push(`Failed to fetch: ${fileName}`);
                return;
            }
            const blob = await response.blob();
            sourceFile = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
        } else if (source.schema === "indexeddb") {
            const fileEntry = await idb_getFile(source.fullPath);
            if (!fileEntry) {
                result.errors.push(`File not found: ${fileName}`);
                return;
            }
            sourceFile = new File([fileEntry.blob], fileName, { type: fileEntry.type || 'application/octet-stream' });
        } else if (source.schema === "navigator_storage" || source.schema === "external_storage") {
            sourceFile = await source.handle.getFile();
        } else {
            result.errors.push(`Unknown source schema: ${source.schema}`);
            return;
        }
    } catch (err) {
        result.errors.push(`Failed to get source: ${err.message}`);
        return;
    }

    // Write to destination
    try {
        if (destSchema === "indexeddb") {
            // Check if exists
            const existingFiles = await idb_getFilesInFolder(targetFolderName);
            if (existingFiles.some(f => f.name === fileName)) {
                ++result.skipped;
                return;
            }
            await idb_putFile(targetFolderName, fileName, sourceFile, sourceFile.type);
            ++result.count;
        } else {
            // OPFS or External
            // Check if exists (TOCTOU-safe: check then create)
            try {
                await targetDirHandle.getFileHandle(fileName, { create: false });
                ++result.skipped;
                return;
            } catch (e) {
                if (e.name !== 'NotFoundError') throw e;
            }

            const fileHandle = await targetDirHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(sourceFile);
            await writable.close();
            ++result.count;
        }
    } catch (err) {
        result.errors.push(`Failed to write ${fileName}: ${err.message}`);
    }
}

// Paste a directory recursively
async function pasteDirectory(source, dirName, destSchema, targetDirHandle, targetFolderName, result, statusCallback) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    // Update status
    if (statusCallback) {
        const actionLabel = source.schema === "remote_storage"
            ? t('downloading', 'Downloading')
            : t('copying', 'Copying');
        statusCallback(`${actionLabel}: ${dirName}/`);
    }

    // Create destination subdirectory
    let subDirHandle = null;
    let subFolderName = null;

    try {
        if (destSchema === "indexeddb") {
            subFolderName = `${targetFolderName}/${dirName}`;
        } else {
            // Check if subdirectory exists
            try {
                subDirHandle = await targetDirHandle.getDirectoryHandle(dirName, { create: false });
                // Directory exists - we'll paste into it (files will be skipped if exist)
            } catch (e) {
                if (e.name === 'NotFoundError') {
                    subDirHandle = await targetDirHandle.getDirectoryHandle(dirName, { create: true });
                } else throw e;
            }
        }
    } catch (err) {
        result.errors.push(`Failed to create directory ${dirName}: ${err.message}`);
        return;
    }

    // Collect and paste all files from source directory
    if (source.schema === "remote_storage") {
        // Download from remote - recursive
        await downloadRemoteDirectory(source.remoteUrl, destSchema, subDirHandle, subFolderName || `${targetFolderName}/${dirName}`, result, statusCallback);
    } else if (source.schema === "indexeddb") {
        // Copy from IndexedDB folder
        const files = await idb_getFilesInFolder(source.handle);
        for (const f of files) {
            if (!isAllowedFile(f.name)) continue;
            if (statusCallback) statusCallback(`${t('copying', 'Copying')}: ${f.name}`);
            const file = new File([f.blob], f.name, { type: f.type || 'application/octet-stream' });
            await pasteFileToDest(file, f.name, destSchema, subDirHandle, subFolderName || `${targetFolderName}/${dirName}`, result);
        }
    } else if (source.schema === "navigator_storage" || source.schema === "external_storage") {
        // Copy from FileSystem directory
        await copyFileSystemDirToDest(source.handle, destSchema, subDirHandle, subFolderName || `${targetFolderName}/${dirName}`, result, statusCallback);
    }
}

// Download remote directory recursively
async function downloadRemoteDirectory(remoteUrl, destSchema, targetDirHandle, targetFolderName, result, statusCallback) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    try {
        const response = await fetch(remoteUrl, { cache: "no-store", mode: "cors" });
        if (!response.ok) {
            result.errors.push(`Failed to fetch directory: ${remoteUrl}`);
            return;
        }

        const htmlText = await response.text();
        const { dirs, files } = parseRemoteDirectoryListing(htmlText, remoteUrl);

        // Download files
        for (const f of files) {
            if (!isAllowedFile(f.name)) continue;

            if (statusCallback) statusCallback(`${t('downloading', 'Downloading')}: ${f.name}`);

            try {
                const fileResponse = await fetch(f.url, { cache: "no-store", mode: "cors" });
                if (!fileResponse.ok) {
                    result.errors.push(`Failed to download: ${f.name}`);
                    continue;
                }
                const blob = await fileResponse.blob();
                const file = new File([blob], f.name, { type: blob.type || 'application/octet-stream' });
                await pasteFileToDest(file, f.name, destSchema, targetDirHandle, targetFolderName, result);
            } catch (err) {
                result.errors.push(`Failed to download ${f.name}: ${err.message}`);
            }
        }

        // Recursively download subdirectories
        for (const d of dirs) {
            if (d.name === ".." || d.name === "." || !d.name) continue;

            let subDirHandle = null;
            let subFolderName = null;

            if (destSchema === "indexeddb") {
                subFolderName = `${targetFolderName}/${d.name}`;
            } else {
                try {
                    subDirHandle = await targetDirHandle.getDirectoryHandle(d.name, { create: false });
                } catch (e) {
                    if (e.name === 'NotFoundError') {
                        subDirHandle = await targetDirHandle.getDirectoryHandle(d.name, { create: true });
                    } else throw e;
                }
            }

            const subUrl = new URL(d.name + "/", remoteUrl).href;
            await downloadRemoteDirectory(subUrl, destSchema, subDirHandle, subFolderName || `${targetFolderName}/${d.name}`, result, statusCallback);
        }
    } catch (err) {
        result.errors.push(`Failed to process remote directory: ${err.message}`);
    }
}

// Copy FileSystem directory to destination recursively
async function copyFileSystemDirToDest(sourceDirHandle, destSchema, targetDirHandle, targetFolderName, result, statusCallback) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    for await (const [name, handle] of sourceDirHandle.entries()) {
        if (handle.kind === "file") {
            if (!isAllowedFile(name)) continue;
            if (statusCallback) statusCallback(`${t('copying', 'Copying')}: ${name}`);
            try {
                const file = await handle.getFile();
                await pasteFileToDest(file, name, destSchema, targetDirHandle, targetFolderName, result);
            } catch (err) {
                result.errors.push(`Failed to copy ${name}: ${err.message}`);
            }
        } else if (handle.kind === "directory") {
            let subDirHandle = null;
            let subFolderName = null;

            if (destSchema === "indexeddb") {
                subFolderName = `${targetFolderName}/${name}`;
            } else {
                try {
                    subDirHandle = await targetDirHandle.getDirectoryHandle(name, { create: false });
                } catch (e) {
                    if (e.name === 'NotFoundError') {
                        subDirHandle = await targetDirHandle.getDirectoryHandle(name, { create: true });
                    } else throw e;
                }
            }

            await copyFileSystemDirToDest(handle, destSchema, subDirHandle, subFolderName || `${targetFolderName}/${name}`, result, statusCallback);
        }
    }
}

// Helper: paste a file object to destination
async function pasteFileToDest(file, fileName, destSchema, targetDirHandle, targetFolderName, result) {
    try {
        if (destSchema === "indexeddb") {
            const existingFiles = await idb_getFilesInFolder(targetFolderName);
            if (existingFiles.some(f => f.name === fileName)) {
                ++result.skipped;
                return;
            }
            await idb_putFile(targetFolderName, fileName, file, file.type);
            ++result.count;
        } else {
            try {
                await targetDirHandle.getFileHandle(fileName, { create: false });
                ++result.skipped;
                return;
            } catch (e) {
                if (e.name !== 'NotFoundError') throw e;
            }

            const fileHandle = await targetDirHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(file);
            await writable.close();
            ++result.count;
        }
    } catch (err) {
        result.errors.push(`Failed to write ${fileName}: ${err.message}`);
    }
}

// ============================================================
// Collect all file pointers recursively under a directory
// ============================================================
async function collectPointers(dirHandle, schema, basePath, remoteTargetUrl = null, excludeImages = false) {
    const result = [];

    if (schema === "remote_storage") {
        // Handle Remote Recursion
        // remoteTargetUrl is the actual URL to fetch (e.g. http://127.0.0.1:8080/Movies/)
        try {
            const response = await fetch(remoteTargetUrl, { cache: "no-store", mode: "cors" });
            if (!response.ok) return [];

            const htmlText = await response.text();
            const { dirs, files } = parseRemoteDirectoryListing(htmlText, remoteTargetUrl);

            // Add files found in this directory
            for (const f of files) {
                const name = f.name;
                // Skip images if excludeImages is true
                if (excludeImages && isImageFile(name)) continue;
                if (!isPlayableOrImageFile(name)) continue;
                result.push({
                    name: name,
                    path: f.url // For remote, path is the direct URL
                });
            }

            // Recurse into subdirectories
            for (const d of dirs) {
                if (d.name === ".." || d.name === "." || !d.name) continue;
                // Ensure sub-URL ends with a slash
                const subUrl = new URL(d.name + "/", remoteTargetUrl).href;
                const subPointers = await collectPointers(null, schema, null, subUrl, excludeImages);
                result.push(...subPointers);
            }
        } catch (e) {
            console.warn("Failed to collect remote pointers from:", remoteTargetUrl, e);
        }
    } else {
        // Standard FileSystemHandle Logic (navigator_storage / external_storage)
        for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind === "file") {
                // Skip images if excludeImages is true
                if (excludeImages && isImageFile(name)) continue;
                if (!isPlayableOrImageFile(name)) continue;
                result.push({
                    name,
                    path: `${schema}://${basePath}/${name}`
                });
            } else if (handle.kind === "directory") {
                const subPath = `${basePath}/${name}`;
                const subPointers = await collectPointers(handle, schema, subPath, null, excludeImages);
                result.push(...subPointers);
            }
        }
    }

    return result;
}

function compareString(a,b)
{
    return a < b ? -1 : a > b ? 1 : 0;
}

// ============================================================
// Add all pointers from a directory (any root) to a playlist
// ============================================================
async function addDirectoryToPlaylist(rootDirHandle, schema, rootName, dirPath, playlistName) {
    if (schema == "indexeddb") {
       return await addIndexedDBFolderToPlaylist(dirPath, !playlistName);
    }
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    // Check if images should be excluded from playlist/now playing
    const excludeImages = typeof window.isImageToPlaylistDisabled === 'function' && window.isImageToPlaylistDisabled();

    try {
        let pointers = [];
        let targetDir = null;

        if (schema === "navigator_storage") {
            const parts = dirPath.split("/");
            targetDir = rootDirHandle;
            for (const part of parts) {
                targetDir = await targetDir.getDirectoryHandle(part, { create: false });
            }
            pointers = await collectPointers(targetDir, schema, `${rootName}/${dirPath}`, null, excludeImages);

        } else if (schema === "external_storage") {
            const parts = dirPath.split("/");
            const topLevelName = parts[0];
            targetDir = rootDirHandle[topLevelName];

            if (!targetDir) {
                alert(`${t('externalDirNotFound', 'External directory not found')} "${topLevelName}".`);
                return;
            }

            const ok = await verifyPermission(targetDir);
            if (!ok) return;

            for (let i = 1; i < parts.length; ++i) {
                targetDir = await targetDir.getDirectoryHandle(parts[i], { create: false });
            }
            pointers = await collectPointers(targetDir, schema, `${rootName}/${dirPath}`, null, excludeImages);

        } else if (schema === "remote_storage") {
            const parts = dirPath.split("/");
            const serverName = parts[0];
            baseUrl = rootDirHandle[serverName];
            if (!baseUrl) {
                alert(`Remote server "${serverName}" not found.`);
                return;
            }

            // Construct the clean target URL
            const relativePath = parts.slice(1).join("/");
            const targetUrl = relativePath
                ? new URL(relativePath + "/", baseUrl).href
                : (baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
            // Call the new recursive remote collector
            pointers = await collectPointers(null , schema, null, targetUrl, excludeImages);

        } else {
            alert(t('unknownStorageSchema', "Unknown storage schema."));
            return;
        }

        // Shared Logic for all schemas:
        if (pointers.length === 0) {
            alert(`${t('noFilesInFolder', 'No files found in')} "${dirPath}".`);
            return;
        }

        pointers.sort((a, b) => compareString(a.path, b.path));

        if (playlistName == null) {
            await startNowPlayingFromPlaylistTable(pointers, 0, null, true);
            return true;
        }

        const playlists = await playlists_load();
        if (!playlists[playlistName]) playlists[playlistName] = [];
        playlists[playlistName].push(...pointers);
        await playlists_save(playlists);
        playlist_renderTree();

        alert(t('addedFilesToPlaylist', 'Added {count} file(s) to playlist').replace('{count}', pointers.length) + ` "${playlistName}".`);
        return true;

    } catch (err) {
        console.error(err);
        alert(t('failedToAddToPlaylist', "Failed to add directory to playlist."));
    }
}

// ============================================================
// Choose playlist and add directory contents
// ============================================================
async function choosePlaylistAndAdd(rootDirHandle, entry, dirName) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
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
    if (!selectedName) return;

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
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
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
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    // Determine which menu items to show
    const isRoot = !dirName;
    const isTopLevel = dirName && !dirName.includes("/");
    const canPaste = storageClipboard && entry.canPaste;
    const canCreateFolder = entry.canCreateFolder;
    // External and remote top-level entries can be renamed (mount name)
    const canRenameMount = isTopLevel && (entry.schema === "external_storage" || entry.schema === "remote_storage");
    // Remote top-level entries can have URL edited
    const canEditUrl = isTopLevel && entry.schema === "remote_storage";
    // External top-level entries can be removed with confirmation
    const canRemoveExternal = isTopLevel && entry.schema === "external_storage";
    // Can set as save location for non-remote storage that supports writing
    const canSetSaveLocation = entry.schema !== "remote_storage" && !isRoot;

    const menuItems = [];

    if (!isRoot) {
        menuItems.push(`<div class="menu-item" data-action="play">${t('playThis', 'Play')}</div>`);
        menuItems.push(`<div class="menu-item" data-action="play-keep-open">${t('playKeepPanel', 'Play (keep panel open)')}</div>`);
        menuItems.push(`<div class="menu-item" data-action="add">${t('addToPlaylist', 'Add to Playlist')}</div>`);
        menuItems.push(`<div class="menu-item" data-action="export">${t('export', 'Export')}</div>`);
        menuItems.push(`<div class="menu-item" data-action="share">${t('share', 'Share')}</div>`);
        menuItems.push(`<div class="menu-item" data-action="copy">${t('copy', 'Copy')}</div>`);
        // Only show rename if both allowModification and allowFolderRename are true, OR for mount rename
        if ((entry.allowModification && entry.allowFolderRename !== false) || canRenameMount) {
            menuItems.push(`<div class="menu-item" data-action="rename">${t('rename', 'Rename')}</div>`);
        }
    }
    // Set as save location submenu
    if (canSetSaveLocation) {
        menuItems.push(`<div class="menu-item" data-action="save-location">${t('setAsSaveLocation', 'Set as Save Location')}</div>`);
    }
    // Edit URL for remote storage
    if (canEditUrl) {
        menuItems.push(`<div class="menu-item" data-action="edit-url">${t('editUrl', 'Edit URL')}</div>`);
    }
    // New Folder action - only for storages that support it
    if (canCreateFolder) {
        menuItems.push(`<div class="menu-item" data-action="new-folder">${t('newFolder', 'New Folder')}</div>`);
    }
    // Paste action - shown when clipboard has content and destination supports it
    if (canPaste) {
        const pasteLabel = storageClipboard.type === 'file'
            ? `${t('paste', 'Paste')}: ${storageClipboard.name}`
            : `${t('paste', 'Paste')}: ${storageClipboard.name}/`;
        menuItems.push(`<div class="menu-item" data-action="paste">${pasteLabel}</div>`);
    }
    // Show delete/remove for root or top-level (always allowed), or nested folders with allowModification
    const canRemoveEntry = !dirName || isTopLevel;
    const canDeleteContent = entry.allowModification && !isRoot && !isTopLevel;

    if (canRemoveEntry || canDeleteContent || canRemoveExternal) {
        // Use "Remove entry" label when useRemoveLabel is true, otherwise "Delete"
        const deleteLabel = (canRemoveEntry && entry.useRemoveLabel) || canRemoveExternal
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
            else if (entry.schema == "remote_storage") {
                parent = await loadRemoteRoots();
            }
            else {
                alert(t('unknownStorageSchema', "Unknown storage schema."));
                return;
            }

            const isactionplay = action === "play";
            if (isactionplay || action === "play-keep-open" ) {
                const addsucceed = await addDirectoryToPlaylist(parent, entry.schema, entry.rootName, dirName, null);
                if (isactionplay && addsucceed) {
                    closeActiveView();
                }
                closeMenu();
                return;
            }

            if (action === "add") {
                await choosePlaylistAndAdd(parent, entry, dirName);
                closeMenu();
                return;
            }

            if (action === "export") {
                if (entry.schema === "indexeddb") {
                    await exportIndexedDBFolder(dirName);
                } else {
                    await exportDirectory(entry, dirName, parent);
                }
                closeMenu();
                return;
            }

            if (action === "share") {
                // Share directory - export as zip-like structure or show info
                // For directories, we can't directly share, so we'll export instead
                if (entry.schema === "indexeddb") {
                    await exportIndexedDBFolder(dirName);
                } else {
                    await exportDirectory(entry, dirName, parent);
                }
                closeMenu();
                return;
            }

            if (action === "copy") {
                // Store directory info in clipboard for paste operation
                // Need to get the actual directory handle
                let dirHandle = null;
                let remoteUrl = null;

                if (entry.schema === "navigator_storage") {
                    const root = await navigator.storage.getDirectory();
                    dirHandle = await root.getDirectoryHandle(entry.dirName);
                    for (const part of dirName.split("/").filter(p => p)) {
                        dirHandle = await dirHandle.getDirectoryHandle(part, { create: false });
                    }
                } else if (entry.schema === "external_storage") {
                    const externalDirs = await loadExternalDirs();
                    const parts = dirName.split("/");
                    const topLevelName = parts[0];
                    dirHandle = externalDirs[topLevelName];

                    if (dirHandle) {
                        // Request permission before copying
                        const hasPermission = await verifyPermission(dirHandle);
                        if (!hasPermission) {
                            alert(t('permissionDenied', "Permission denied for external directory."));
                            closeMenu();
                            return;
                        }
                        // Navigate to the actual directory
                        for (let i = 1; i < parts.length; ++i) {
                            dirHandle = await dirHandle.getDirectoryHandle(parts[i], { create: false });
                        }
                    }
                } else if (entry.schema === "remote_storage") {
                    // For remote, store the URL
                    const remoteRoots = await loadRemoteRoots();
                    const parts = dirName.split("/");
                    const serverName = parts[0];
                    const baseUrl = remoteRoots[serverName];
                    if (baseUrl) {
                        const relativePath = parts.slice(1).join("/");
                        remoteUrl = relativePath
                            ? new URL(relativePath + "/", baseUrl).href
                            : (baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
                    }
                } else if (entry.schema === "indexeddb") {
                    // For IndexedDB, just store the folder name
                    dirHandle = dirName; // Just the folder name string
                }

                if (!dirHandle && !remoteUrl) {
                    alert(t('cannotCopy', "Cannot copy this directory."));
                    closeMenu();
                    return;
                }

                const dirNameOnly = dirName.split("/").pop();
                storageClipboard = {
                    type: 'dir',
                    name: dirNameOnly,
                    source: {
                        schema: entry.schema,
                        handle: dirHandle,
                        remoteUrl: remoteUrl,
                        fullPath: dirName,
                        rootName: entry.rootName,
                        dirName: entry.dirName
                    }
                };
                alert(`${t('copied', 'Copied')}: "${dirNameOnly}/"`);
                closeMenu();
                return;
            }

            if (action === "paste") {
                pasteToDestination(entry, dirName, parent);
                closeMenu();
                return;
            }

            if (action === "new-folder") {
                const folderName = prompt(t('newFolderName', "New folder name:"));
                if (!folderName || !folderName.trim()) {
                    closeMenu();
                    return;
                }
                const trimmed = folderName.trim();

                try {
                    if (entry.schema === "navigator_storage") {
                        const root = await navigator.storage.getDirectory();
                        let targetDir = await root.getDirectoryHandle(entry.dirName);
                        if (dirName) {
                            for (const part of dirName.split("/").filter(p => p)) {
                                targetDir = await targetDir.getDirectoryHandle(part);
                            }
                        }
                        await targetDir.getDirectoryHandle(trimmed, { create: true });
                        renderStorage();
                    } else if (entry.schema === "indexeddb") {
                        // For IndexedDB, create a new virtual folder
                        const folderPath = dirName ? `${dirName}/${trimmed}` : trimmed;
                        // Just create an empty marker file to ensure folder exists
                        await idb_putFile(folderPath, ".folder_marker", new Blob([]), "application/octet-stream");
                        renderStorage();
                    }
                } catch (err) {
                    console.error("Failed to create folder:", err);
                    alert(`${t('failedToCreateFolder', 'Failed to create folder')}: ${err.message}`);
                }
                closeMenu();
                return;
            }

            if (action === "rename") {
                const isTopLevel = dirName && !dirName.includes("/");
                const canRenameMount = isTopLevel && (entry.schema === "external_storage" || entry.schema === "remote_storage");

                if (entry.schema === "indexeddb") {
                    alert(t('renameNotAvailable', "Rename not available for IndexedDB."));
                } else if (canRenameMount) {
                    // Rename mount name for external or remote storage
                    const oldName = dirName;
                    const newName = prompt(t('newMountName', "New name:"), oldName);
                    if (newName && newName.trim() && newName.trim() !== oldName) {
                        const trimmed = newName.trim();

                        // Validate name - no special characters
                        if (!isValidStorageName(trimmed)) {
                            alert(t('invalidStorageName', "Name cannot contain . / \\ : * ? \" < > | or be empty."));
                            closeMenu();
                            return;
                        }

                        try {
                            if (entry.schema === "external_storage") {
                                const dirs = await loadExternalDirs();
                                if (dirs[trimmed]) {
                                    alert(`${t('alreadyExists', 'Already exists')}: "${trimmed}"`);
                                    closeMenu();
                                    return;
                                }
                                dirs[trimmed] = dirs[oldName];
                                delete dirs[oldName];
                                await kv_set("external_dirs", dirs);
                                window.externalStorageRoot = dirs;
                            } else if (entry.schema === "remote_storage") {
                                const roots = await loadRemoteRoots();
                                if (roots[trimmed]) {
                                    alert(`${t('alreadyExists', 'Already exists')}: "${trimmed}"`);
                                    closeMenu();
                                    return;
                                }
                                roots[trimmed] = roots[oldName];
                                delete roots[oldName];
                                await saveRemoteRoots(roots);
                            }
                            renderStorage();
                        } catch (err) {
                            console.error("Failed to rename:", err);
                            alert(`${t('failedToRename', 'Failed to rename')}: ${err.message}`);
                        }
                    }
                } else {
                    // Regular folder rename for navigator_storage
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
                        renderStorage();
                    }
                }
                closeMenu();
                return;
            }

            if (action === "edit-url") {
                // Edit URL for remote storage
                const roots = await loadRemoteRoots();
                const oldUrl = roots[dirName];
                const newUrl = prompt(t('editRemoteUrl', "Edit remote URL:"), oldUrl);

                if (!newUrl) {
                    closeMenu();
                    return;
                }

                // Validate URL
                try {
                    const u = new URL(newUrl);
                    if (!u.protocol.startsWith('http')) {
                        alert(t('onlyHttpSupported', "Only http:// and https:// URLs are supported."));
                        closeMenu();
                        return;
                    }
                } catch {
                    alert(t('invalidUrl', "Invalid URL."));
                    closeMenu();
                    return;
                }

                let finalUrl = newUrl;
                if (!finalUrl.endsWith('/')) finalUrl += '/';

                roots[dirName] = finalUrl;
                await saveRemoteRoots(roots);
                alert(`${t('urlUpdated', 'URL updated')}: "${dirName}"`);
                renderStorage();
                closeMenu();
                return;
            }

            if (action === "delete") {
                const isTopLevel = dirName && !dirName.includes("/");
                const isEntryRemoval = entry.useRemoveLabel && (!dirName || isTopLevel);
                const isExternalNotTopRemoval = dirName && !isTopLevel && entry.schema === "external_storage";

                let confirmMsg;
                if (entry.schema === "indexeddb") {
                    confirmMsg = dirName
                        ? `${t('deleteFolderConfirm', 'Delete folder')} "${dirName}"?`
                        : t('deleteAllFilesConfirm', "Delete all files from storage?");
                } else if (isExternalNotTopRemoval) {
                    // External storage removal - require typing the name to confirm
                    confirmMsg = `${t('confirmRemoveExternal', 'Type the directory name to confirm removal')}:\n"${dirName}"`;
                    const userInput = prompt(confirmMsg);
                    if (userInput !== dirName) {
                        if (userInput) alert(t('confirmationMismatch', "Confirmation name does not match."));
                        closeMenu();
                        return;
                    }
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

                // Skip confirm for external (already confirmed with typing)
                const shouldProceed = isExternalNotTopRemoval || confirm(confirmMsg);
                if (!shouldProceed) {
                    closeMenu();
                    return;
                }

                if (entry.schema === "remote_storage") {
                    const roots = await loadRemoteRoots();
                    if (isRoot) {
                        await saveRemoteRoots({});
                    } else {
                        delete roots[dirName];
                        await saveRemoteRoots(roots);
                    }
                } else if (entry.schema === "indexeddb") {
                    if (dirName) {
                        // Delete a specific IndexedDB folder
                        await idb_deleteFolder(dirName);
                    } else {
                        // Delete all IndexedDB files
                        await idb_clearAll();
                    }
                } else if (entry.schema === "external_storage") {
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
                closeMenu();
                renderStorage();
                return;
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
                    if (entry.schema == "remote_storage") {
                        info = [
                            `${t('directoryName', 'Storage Name')}: ${displayName}`,
                            `${t('fullPath', 'Full Path')}: ${await resolveRemoteDirToUrl(dirName)}`
                        ];
                    }
                    else if (entry.schema === "indexeddb") {
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
                closeMenu();
                return;
            }

            // Save location submenu
            if (action === "save-location") {
                showSaveLocationSubMenu(entry, dirName, button);
                closeMenu();
                return;
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
            if (isPlayableOrImageFile(name)) {
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

// Show submenu for setting save location
function showSaveLocationSubMenu(entry, dirName, parentButton) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    // Close any existing menu
    const existing = document.querySelector(".context-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.className = "context-menu";

    const menuItems = [
        `<div class="menu-item" data-type="screenRecording">📹 ${t('screenRecordingSaveLocation', 'Screen Recording')}</div>`,
        `<div class="menu-item" data-type="videoRecording">🎬 ${t('videoRecordingSaveLocation', 'Video Recording')}</div>`,
        `<div class="menu-item" data-type="screenshot">🖼️ ${t('screenshotSaveLocation', 'Screenshot')}</div>`,
        `<div class="menu-item" data-action="close">${t('close', 'Close')}</div>`
    ];

    menu.innerHTML = menuItems.join("");
    document.body.appendChild(menu);

    // Position near the parent button
    const btnRect = parentButton.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.visibility = "hidden";

    let left = btnRect.left - menu.offsetWidth;
    if (left < 0) left = btnRect.right;
    if (left + menu.offsetWidth > window.innerWidth) left = window.innerWidth - menu.offsetWidth;

    let top = btnRect.top;
    if (top + menu.offsetHeight > window.innerHeight) top = window.innerHeight - menu.offsetHeight;

    menu.style.left = left + "px";
    menu.style.top = top + "px";
    menu.style.visibility = "visible";

    // Handle clicks
    const closeMenu = () => menu.remove();

    menu.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", async () => {
            const type = item.dataset.type;
            const action = item.dataset.action;

            if (action === "close") {
                closeMenu();
                return;
            }

            if (type) {
                // Get the handle for external storage
                let handle = null;
                if (entry.schema === "external_storage") {
                    const externalDirs = await loadExternalDirs();
                    const parts = dirName.split("/");
                    handle = externalDirs[parts[0]];
                    if (handle && parts.length > 1) {
                        for (let i = 1; i < parts.length; ++i) {
                            handle = await handle.getDirectoryHandle(parts[i]);
                        }
                    }
                }

                const config = {
                    schema: entry.schema,
                    rootName: entry.rootName,
                    path: dirName,
                    handle: handle
                };

                setSaveLocationConfig(type, config);
                const typeLabels = {
                    screenRecording: t('screenRecordingSaveLocation', 'Screen Recording'),
                    videoRecording: t('videoRecordingSaveLocation', 'Video Recording'),
                    screenshot: t('screenshotSaveLocation', 'Screenshot')
                };
                alert(`${typeLabels[type]} ${t('saveLocationSet', 'save location set to')}: ${dirName}`);
                // Update settings display if function exists
                if (typeof window.updateSaveLocationsDisplay === 'function') {
                    window.updateSaveLocationsDisplay();
                }
                closeMenu();
            }
        });
    });

    // Close on outside click
    const closeHandler = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener("click", closeHandler, true);
        }
    };
    document.addEventListener("click", closeHandler, true);
}

function showStorageFileMenu(entry, name, handle, fullPath, button) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    const isPlayable = isPlayableOrImageFile(name);
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
    menuItems.push(`<div class="menu-item" data-action="share">${t('share', 'Share')}</div>`);
    menuItems.push(`<div class="menu-item" data-action="copy">${t('copy', 'Copy')}</div>`);
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
            const isRemote = entry.schema === "remote_storage";

            const action = item.dataset.action;

            const actionisplay = action === "play";
            if (actionisplay || action === "play-keep-open") {
                if (isPlayableOrImageFile(name)) {
                    let entryPath;
                    if (isRemote)
                    {
                        entryPath = handle;
                    }
                    else
                    {
                        entryPath = `${entry.schema}://${entry.rootName}/${fullPath}`
                    }
                    await play_source(handle, { entryPath });
                    if (actionisplay) {
                        closeActiveView();
                    }
                } else {
                    alert(t('fileCannotBePlayed', "This file type cannot be played directly."));
                }
                closeMenu();
                return;
            }

            if (action === "add") {
                if (!isPlayableOrImageFile(name)) {
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
                        let path;
                        if (isRemote)
                        {
                            path = handle;
                        }
                        else
                        {
                            path = `${entry.schema}://${entry.rootName}/${fullPath}`;
                        }
                        playlists[selectedName].push({ name, path });
                        await playlists_save(playlists);
                        playlist_renderTree();
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
                if (isRemote) {
                    // Just open the URL to download it
                    window.open(handle, '_blank');
                } else {
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
            }

            if (action === "share") {
                try {
                    let shareData = {
                        title: name,
                        text: `${name}\n${isRemote ? handle : (fullPath || name)}`
                    };

                    // Add PWA URL if enabled
                    if (typeof isSharePwaPlayerUrlEnabled === 'function' && isSharePwaPlayerUrlEnabled()) {
                        const pwaUrl = typeof getPwaPlayerUrl === 'function' ? getPwaPlayerUrl() : window.location.href;
                        shareData.text += `\n\nPWA Player: ${pwaUrl}`;
                    }

                    if (!isRemote) {
                        // Local file: Try to attach the actual file blob
                        const file = await handle.getFile();
                        shareData.files = [file];
                    } else {
                        // Remote file: Just share the link in the text
                        shareData.url = handle;
                    }

                    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
                        await navigator.share(shareData);
                    } else {
                        // Fallback for sharing
                        if (isRemote) {
                            // For remote, just copy to clipboard or alert the URL
                            await navigator.clipboard.writeText(handle);
                            alert(t('linkCopied', "Link copied to clipboard: ") + handle);
                        } else {
                            throw new Error("Cannot share local file, falling back to export");
                        }
                    }
                } catch (e) {
                    if (e.name !== 'AbortError') {
                        console.warn('Share failed:', e);
                        // Fallback: trigger export logic
                        if (isRemote) {
                            window.open(handle, '_blank');
                        } else {
                            const file = await handle.getFile();
                            const url = URL.createObjectURL(file);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = name;
                            a.click();
                            URL.revokeObjectURL(url);
                        }
                    }
                }
            }

            if (action === "properties") {
                // 1. Fix the entryPath and Info for Remote
                let entryPath;
                if (isRemote) {
                    // For remote, the "fullPath" is already the absolute URL stored in the handle
                    entryPath = handle; 
                } else {
                    entryPath = `${entry.schema}://${entry.rootName}/${fullPath}`;
                }

                let info = [
                    `${t('fileName', 'File Name')}: ${name}`,
                    `${t('fullPath', 'Full Path')}: ${entryPath}`
                ];

                // 2. Deal with handle.getFile()
                try {
                    if (isRemote) {
                        // REMOTE: Fetch headers to get size and type
                        const response = await fetch(handle, { method: 'HEAD', mode: "cors" });
                        if (response.ok) {
                            const size = response.headers.get('content-length');
                            const type = response.headers.get('content-type');
                            const lastMod = response.headers.get('last-modified');

                            if (size) {
                                const sizeKB = (size / 1024).toFixed(2);
                                const sizeMB = (size / 1048576).toFixed(2);
                                info.push(`${t('size', 'Size')}: ${size} bytes (${sizeKB} KB / ${sizeMB} MB)`);
                            }
                            info.push(`${t('type', 'Type')}: ${type || 'Unknown'}`);
                            if (lastMod) {
                                info.push(`${t('lastModified', 'Last Modified')}: ${new Date(lastMod).toISOString()}`);
                            }
                        } else {
                            info.push(`${t('status', 'Status')}: Remote file reachable but metadata hidden.`);
                        }
                    } else {
                        // LOCAL (OPFS/External): Standard File System API
                        const file = await handle.getFile();
                        const size = file.size;
                        const sizeKB = (size / 1024).toFixed(2);
                        const sizeMB = (size / 1048576).toFixed(2);
                        const lastModified = new Date(file.lastModified).toISOString();
                        
                        info.push(`${t('size', 'Size')}: ${size} bytes (${sizeKB} KB / ${sizeMB} MB)`);
                        info.push(`${t('type', 'Type')}: ${file.type || 'Unknown'}`);
                        info.push(`${t('lastModified', 'Last Modified')}: ${lastModified}`);
                    }
                    alert(info.join('\n\n'));
                } catch (err) {
                    console.error("Failed to get file properties:", err);
                    if (entry.schema === "remote") {
                        info.push(`${t('error', 'Error')}: Could not connect to remote server for metadata.`);
                    }
                }
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

            if (action === "copy") {
                // Store file info in clipboard for paste operation
                storageClipboard = {
                    type: 'file',
                    name: name,
                    source: {
                        schema: entry.schema,
                        handle: handle,
                        fullPath: fullPath,
                        rootName: entry.rootName,
                        dirName: entry.dirName
                    }
                };
                alert(`${t('copied', 'Copied')}: "${name}"`);
            }

            closeMenu();
        });
    });
}

function renderFileItem(subList, name, handle, entry, currentPath = "") {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
    const li = document.createElement("li");
    li.className = "storage-file-item";

    const fullPath = currentPath ? `${currentPath}/${name}` : name;

    const isPlayable = isPlayableOrImageFile(name);
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

            // FIX: Handle remote_storage pathing
            let entryPath;
            if (entry.schema === "remote_storage") {
                // For remote, the handle IS the full http(s) URL
                entryPath = handle; 
            } else {
                // For local, use the internal URI schema
                entryPath = `${entry.schema}://${entry.rootName}/${fullPath}`;
            }

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
                    // For remote, handle is a string URL. For local, it's a FileHandle.
                    // window.loadSubtitle needs to be able to handle both.
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
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
    const li = document.createElement("li");
    li.className = "storage-file-item";

    const isPlayable = isPlayableOrImageFile(name);
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
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    const isPlayable = isPlayableOrImageFile(name);
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
    menuItems.push(`<div class="menu-item" data-action="share">${t('share', 'Share')}</div>`);
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
                if (isPlayableOrImageFile(name)) {
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
                if (!isPlayableOrImageFile(name)) {
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
                        playlist_renderTree();
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

            if (action === "share") {
                // Share IndexedDB file using Web Share API
                if (navigator.share && navigator.canShare) {
                    try {
                        const file = new File([fileEntry.blob], name, { type: fileEntry.type || "application/octet-stream" });
                        const shareData = {
                            title: name,
                            text: name,
                            files: [file]
                        };

                        if (navigator.canShare(shareData)) {
                            await navigator.share(shareData);
                        } else {
                            alert(t('shareNotSupported', 'Sharing this file type is not supported'));
                        }
                    } catch (e) {
                        if (e.name !== 'AbortError') {
                            console.warn('Share failed:', e);
                            // Fallback: export the file instead
                            try {
                                const url = URL.createObjectURL(fileEntry.blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = name;
                                a.click();
                                URL.revokeObjectURL(url);
                            } catch (err) {
                                console.error("Failed to export file:", err);
                            }
                        }
                    }
                } else {
                    // Web Share not available, export instead
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
            const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
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
    else if (entry.schema === "remote_storage") {
// CASE A: Top-level listing of all imported remote servers
        if (dirHandle && typeof dirHandle === "object" && !Array.isArray(dirHandle)) {
            // Iterate through the object { "127.0.0.1": "http://127.0.0.1:8080/", ... }
            for (const [serverName, serverUrl] of Object.entries(dirHandle)) {
                dirs.push({
                    name: serverName,
                    handle: serverUrl,  // Pass the specific URL as the handle for the next level
                    isRoot: true
                });
            }
        }
        // 2. Handle the case where we've selected a specific server (handle is now a string URL)
        else if (dirHandle && typeof dirHandle === "string") {
            const baseUrl = dirHandle.endsWith('/') ? dirHandle : dirHandle + '/';
            // Construct the target URL for the current sub-directory
            const targetUrl = baseUrl;

            try {
                const response = await fetch(targetUrl, { cache: "no-store", mode: "cors" });
                if (response.ok) {
                    const htmlText = await response.text();
                    // parseRemoteDirectoryListing handles DOM parsing and filtering
                    const { dirs: remoteDirs, files: remoteFiles } = parseRemoteDirectoryListing(htmlText, targetUrl);

                    for (const d of remoteDirs) {
                        if (d.name === ".." || d.name === "." || !d.name) continue;
                        dirs.push({
                            name: d.name,
                            handle: baseUrl ? `${baseUrl}${d.name}` : d.name
                        });
                    }

                    for (const f of remoteFiles) {
                        files.push({ 
                            name: f.name,
                            handle: f.url // Full URL for the media file
                        });
                    }
                }
            } catch (err) {
                console.warn(`Failed to load remote directory ${targetUrl}:`, err);
            }
        }
    }
    else {
        console.warn("Unknown dirHandle type in loadStorageSubdirs:", dirHandle);
        return;
    }

    // Sort directories and files alphabetically
    dirs.sort((a, b) => compareString(a.name,b.name));
    files.sort((a, b) => compareString(a.name,b.name));

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

        let rootDir = null;
        let entryCount = 0;

        try {
            if (entry.schema === "navigator_storage") {
                // Create directory if it doesn't exist so we can use it
                try {
                    rootDir = await root.getDirectoryHandle(entry.dirName, { create: true });
                } catch (err) {
                    if (err.name === 'NotFoundError') {
                        rootDir = await root.getDirectoryHandle(entry.dirName, { create: true });
                    } else throw err;
                }
                // Count entries
                for await (const _ of rootDir.entries()) {
                    ++entryCount;
                }
            } else if (entry.schema === "external_storage") {
                rootDir = await loadExternalDirs();
                entryCount = rootDir ? Object.keys(rootDir).length : 0;
            } else if (entry.schema === "indexeddb") {
                const idbFolders = await idb_listFolders();
                rootDir = idbFolders || [];
                entryCount = idbFolders.length;
            }
            else if (entry.schema === "remote_storage") {
                rootDir = await loadRemoteRoots();
                entryCount = rootDir ? Object.keys(rootDir).length : 0;
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
            // Still show the root even if error - user can create/paste
            entryCount = 0;
        }

        const li = document.createElement("li");
        li.className = "storage-node";

        // Show entry count
        const displayRootName = `${entry.schema}://${entry.rootName} (${entryCount})`;

        li.innerHTML = `
            <div class="storage-header">
                <button class="toggle">+</button>
                <span class="storage-name">${displayRootName}</span>
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
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
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
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
    const confirmed = confirm(
        t('clearAllImportMountConfirm', "This will permanently delete all imported directories and mounted storages:\n") +
        IMPORT_ROOTS.map(r => `• "${r.dirName}"`).join("\n") +
        "\n\n" + t('clearAllImportMountNote', "This will also clear IndexedDB storage.\n\nAre you sure you want to proceed?")
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
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
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
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
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
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
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
window.idb_getFilesInFolder = idb_getFilesInFolder;

// Remote (normal URL) storage
let remoteStorageRoots = null;

async function loadRemoteRoots() {
    if (remoteStorageRoots === null) {
        remoteStorageRoots = await kv_get("remote_roots") || {};
    }
    return remoteStorageRoots;
}

async function saveRemoteRoots(roots) {
    remoteStorageRoots = roots;
    await kv_set("remote_roots", roots);
}

// Expose loadRemoteRoots globally for use by playlist.js
window.loadRemoteRoots = loadRemoteRoots;

document.getElementById("addRemoteBtn").addEventListener("click", async () => {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    let url = prompt(
        `${t('enterRemoteUrl', 'Enter remote server URL (must end with /)')}:\n\n` +
        `${t('examples', 'Examples')}:\n` +
        `• http://192.168.1.100:8080/\n` +
        `• http://mydevice.local:8080/\n` +
        `• http://router.lan/\n` +
        `• http://mydevice.internal:8080/\n` +
        `• http://[fe80::1%25en0]:8080/`,
        "https://"
    );

    if (!url) return;

    // Basic validation
    try {
        const u = new URL(url);
        if (!u.protocol.startsWith('http')) {
            alert(t('onlyHttpSupported', "Only http:// and https:// URLs are supported."));
            return;
        }
    } catch {
        alert(t('invalidUrl', "Invalid URL."));
        return;
    }

    if (!url.endsWith('/')) url += '/';

    // Name is required - prompt until valid name provided (max 3 attempts)
    let displayName = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        ++attempts;
        const input = prompt(t('enterRemoteName', "Enter a name for this remote server (no special characters like . / \\ : * ? \" < > |):"));

        if (!input) {
            if (attempts < maxAttempts) {
                alert(t('nameRequired', "Name is required. Please try again."));
                continue;
            }
            alert(t('cancelledAfterAttempts', "Operation cancelled after failed attempts."));
            return;
        }

        const trimmed = input.trim();
        if (!trimmed) {
            if (attempts < maxAttempts) {
                alert(t('nameRequired', "Name is required. Please try again."));
                continue;
            }
            alert(t('cancelledAfterAttempts', "Operation cancelled after failed attempts."));
            return;
        }

        if (!isValidStorageName(trimmed)) {
            if (attempts < maxAttempts) {
                alert(t('invalidStorageName', "Name cannot contain . / \\ : * ? \" < > | or be empty. Please try again."));
                continue;
            }
            alert(t('cancelledAfterAttempts', "Operation cancelled after failed attempts."));
            return;
        }

        displayName = trimmed;
        break;
    }

    if (!displayName) return;

    let roots = await loadRemoteRoots();
    if (roots[displayName]) {
        alert(`${t('alreadyExists', 'Already exists')}: "${displayName}"`);
        return;
    }

    roots[displayName] = url;
    await saveRemoteRoots(roots);

    alert(`${t('remoteServerImported', 'Remote server imported successfully')}: "${displayName}"`);
    renderStorage();
});

// ============================================================
// Remote Directory Listing Parser (supports http-server + nginx + generic)
// ============================================================
function parseRemoteDirectoryListing(htmlText, baseUrl) {
    const dirs = [];
    const files = [];

    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const links = doc.querySelectorAll('a[href]');

    for (const link of links) {
        let href = link.getAttribute('href') || '';
        const name = link.textContent.trim();

        if (!href || href === '../' || href === './' || href === '/') continue;

        // Convert relative link to absolute URL
        let fullUrl;
        try {
            fullUrl = new URL(href, baseUrl).href;
        } catch (e) {
            continue;
        }

        if (href.endsWith('/') || name.endsWith('/')) {
            const folderName = name.replace(/\/$/, '');
            if (folderName) {
                dirs.push({ name: folderName });
            }
        } 
        else if (isPlayableOrImageFile(name) || isSubtitleFile(name)) {
            files.push({
                name: name,
                url: fullUrl
            });
        }
    }

    // Sort
    dirs.sort((a, b) => compareString(a.name, b.name));
    files.sort((a, b) => compareString(a.name, b.name));

    return { dirs, files };
}

/**
 * Resolves a virtual dirName to a real HTTP URL for remote_storage.
 * @param {string} dirName - The virtual path (e.g., "MyServer/Movies/Action")
 * @returns {Promise<string|null>} - The actual URL (e.g., "http://1.2.3.4:8080/Movies/Action/")
 */
async function resolveRemoteDirToUrl(dirName) {
    if (!dirName) return null;

    // 1. Load the map of remote servers { "Alias": "BaseURL" }
    const remoteRoots = await loadRemoteRoots();
    
    // 2. Split the path into parts
    const parts = dirName.split("/");
    const serverAlias = parts[0];
    const baseUrl = remoteRoots[serverAlias];

    if (!baseUrl) {
        console.warn(`Remote server alias "${serverAlias}" not found in storage.`);
        return null;
    }

    // 3. Extract the relative path (everything after the server alias)
    const relativePath = parts.slice(1).join("/");

    // 4. Construct the final URL
    // We use the URL constructor to handle slashes correctly.
    // We append a trailing slash because this is a directory.
    try {
        const urlObj = relativePath 
            ? new URL(relativePath + "/", baseUrl) 
            : new URL(baseUrl);
            
        return urlObj.href;
    } catch (e) {
        console.error("Failed to construct remote URL:", e);
        return null;
    }
}

// ============================================================
// Save Location Configuration
// ============================================================
// Stores paths for screen recordings, video recordings, and screenshots
// Format: { schema, rootName, path, handle (for external) }

// Get save location config for a type
function getSaveLocationConfig(type) {
    const key = `saveLocation_${type}`;
    const config = localStorage.getItem(key);
    return config ? JSON.parse(config) : null;
}

// Set save location config for a type
function setSaveLocationConfig(type, config) {
    const key = `saveLocation_${type}`;
    localStorage.setItem(key, JSON.stringify(config));
}

// Clear save location config for a type
function clearSaveLocationConfig(type) {
    const key = `saveLocation_${type}`;
    localStorage.removeItem(key);
}

// Try to save a file to configured location, fallback to download
async function saveFileToConfiguredLocation(type, blob, filename) {
    const config = getSaveLocationConfig(type);

    if (!config) {
        window.fallbackDownload(blob, filename);
        return false;
    }

    try {
        if (config.schema === 'indexeddb') {
            const folder = config.path || `idb_${Date.now()}`;
            await idb_putFile(folder, filename, blob, blob.type);
            if (typeof renderStorage === 'function') renderStorage();
            return true;
        }

        // Both navigator_storage and external_storage use FileSystem API
        let dirHandle;
        let startidx = 0;
        const parts = config.path.split('/');
        if (config.schema === 'navigator_storage') {
            dirHandle = await navigator.storage.getDirectory();
            dirHandle = await dirHandle.getDirectoryHandle(config.rootName, { create: true });
        } else if (config.schema === 'external_storage') {
            const externalDirs = await loadExternalDirs();
            const topLevelName = parts[0];
            dirHandle = externalDirs[topLevelName];
            startidx = 1;
        }
        else
        {
            throw new Error(`Unsupported storage schema: ${config.schema}`);
        }

        for (let i = startidx; i < parts.length; ++i) {
            dirHandle = await dirHandle.getDirectoryHandle(parts[i], { create: true });
        }
        // Permission check (harmless if API doesn't exist)
        if (dirHandle.queryPermission) {
            const permission = await dirHandle.queryPermission({ mode: 'readwrite' });
            if (permission !== 'granted' && dirHandle.requestPermission) {
                const request = await dirHandle.requestPermission({ mode: 'readwrite' });
                if (request !== 'granted') {
                    throw new Error('Permission denied');
                }
            }
        }

        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        try {
            await writable.write(blob);
        } finally {
            await writable.close();
        }

        if (typeof renderStorage === 'function') renderStorage();
        return true;
    } catch (err) {
        console.warn(`Failed to save to configured location (${type}):`, err);
        window.fallbackDownload(blob, filename);
        return false;
    }
}

// Expose globally
window.getSaveLocationConfig = getSaveLocationConfig;
window.setSaveLocationConfig = setSaveLocationConfig;
window.clearSaveLocationConfig = clearSaveLocationConfig;
window.saveFileToConfiguredLocation = saveFileToConfiguredLocation;
