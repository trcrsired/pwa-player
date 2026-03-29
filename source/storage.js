// ============================================================
// Central definition of all import roots inside private storage
// ============================================================
//
// Each entry defines:
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
        useRemoveLabel: false
    },
    {
        schema: "navigator_storage",
        rootName: "files",
        dirName: "files",
        enabled: true,
        showSubdirs: true,
        allowModification: true,
        useRemoveLabel: false
    },
    {
        schema: "external_storage",
        rootName: "external",
        dirName: "external",
        enabled: true,
        showSubdirs: true,
        allowModification: false,
        useRemoveLabel: true
    }
];

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
    let attempts = 0;

    while (attempts < 3) {
        const name = prompt(
            `Directory "${baseName}" already exists.\nEnter a new name (no slashes):`,
            baseName
        );

        if (name === null) return null;

        const trimmed = name.trim();
        if (!trimmed || trimmed.includes('/')) {
            alert("Invalid name. Directory names must not be empty or contain slashes.");
            return null;
        }

        if (trimmed === baseName) {
            attempts++;
            alert(`"${baseName}" already exists. Please choose a different name.`);
            continue;
        }

        if (!(await dirExists(trimmed, parentHandle))) {
            return trimmed;
        }

        ++attempts;
        alert(`"${trimmed}" already exists. Try again.`);
    }

    alert("Too many attempts. Import cancelled.");
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
                alert(`External directory "${topLevelName}" not found.`);
                return;
            }

            // Ensure permission is granted
            const ok = await verifyPermission(targetDir);
            if (!ok) {
                alert("Permission denied for external directory.");
                return;
            }

            // Traverse nested path if any
            for (let i = 1; i < parts.length; ++i) {
                targetDir = await targetDir.getDirectoryHandle(parts[i], { create: false });
            }

        } else {
            alert("Unknown storage schema.");
            return;
        }

        const basePath = `${rootName}/${dirPath}`;
        const pointers = await collectPointers(targetDir, schema, basePath);

        if (pointers.length === 0) {
            alert(`No files found in "${dirPath}".`);
            return;
        }

        const playlists = await playlists_load();
        if (!playlists[playlistName]) {
            playlists[playlistName] = [];
        }

        playlists[playlistName].push(...pointers);
        await playlists_save(playlists);

        alert(`Added ${pointers.length} items to playlist "${playlistName}".`);
    } catch (err) {
        console.error(err);
        alert("Failed to add directory to playlist.");
    }
}

// ============================================================
// Choose playlist and add directory contents
// ============================================================
async function choosePlaylistAndAdd(rootDirHandle, entry, dirName) {
    const playlists = await playlists_load();
    const names = Object.keys(playlists);

    const choice = prompt(
        "Add to which playlist?\n" +
        names.map((n, i) => `${i + 1}. ${n}`).join("\n"),
        "1"
    );

    if (!choice) return;

    const index = parseInt(choice, 10) - 1;
    if (index < 0 || index >= names.length) {
        alert("Invalid selection");
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
                alert(`External directory "${topLevelName}" not found.`);
                return;
            }

            // Ensure permission
            const ok = await verifyPermission(targetDir);
            if (!ok) {
                alert("Permission denied for external directory.");
                return;
            }

            // Traverse nested path
            for (let i = 1; i < parts.length; ++i) {
                targetDir = await targetDir.getDirectoryHandle(parts[i], { create: false });
            }
        } else {
            alert("Unknown storage schema.");
            return;
        }

        // Collect all files recursively
        const files = await collectFilesForExport(targetDir, "");

        if (files.length === 0) {
            alert("No files found to export.");
            return;
        }

        // Ask user confirmation
        const ok = confirm(`Export all files from "${dirPath}"?\n\nFound ${files.length} file(s).`);
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

        alert(`Exported ${downloaded} file(s).`);

    } catch (err) {
        console.error(err);
        alert("Failed to export directory.");
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
        if (entry.allowModification) {
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
            else {
                alert("Unknown storage schema.");
                return;
            }

            if (action === "add") {
                await choosePlaylistAndAdd(parent, entry, dirName);
            }

            if (action === "export") {
                await exportDirectory(entry, dirName, parent);
            }

            if (action === "rename") {
                // For nested paths, get just the folder name
                const parts = dirName.split("/");
                const oldName = parts.pop();
                const pathToParent = parts.join("/");

                const newName = prompt("New folder name:", oldName);
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

            if (action === "delete") {
                const isTopLevel = dirName && !dirName.includes("/");
                const isEntryRemoval = entry.useRemoveLabel && (!dirName || isTopLevel);

                let confirmMsg;
                if (isEntryRemoval) {
                    // Entry removal - only remove reference, not actual files
                    confirmMsg = dirName
                        ? `Remove entry "${dirName}"?\n\nNote: The actual folder on your device will NOT be deleted.`
                        : `Remove all entries from "${entry.rootName}"?\n\nNote: The actual folders on your device will NOT be deleted.`;
                } else {
                    confirmMsg = dirName
                        ? `Delete folder "${dirName}"?`
                        : `Delete entire "${entry.rootName}" storage?`;
                }

                if (confirm(confirmMsg)) {
                    if (isEntryRemoval && entry.schema === "external_storage") {
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

                let info = [
                    `${t('directoryName', 'Directory Name')}: ${displayName}`,
                    `${t('fullPath', 'Full Path')}: ${fullPath}`
                ];

                // Count files in directory
                let fileCount = 0;
                let totalSize = 0;
                try {
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
                } catch (err) {
                    console.error("Failed to count files:", err);
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
            count++;
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
    if (entry.allowModification) {
        menuItems.push(`<div class="menu-item" data-action="rename">${t('rename', 'Rename')}</div>`);
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
                    alert("This file type cannot be played directly.");
                }
                closeMenu();
                return;
            }

            if (action === "play-keep-open") {
                if (isPlaylistFile(name)) {
                    const entryPath = `${entry.schema}://${entry.rootName}/${fullPath}`;
                    await play_source(handle, { entryPath });
                } else {
                    alert("This file type cannot be played directly.");
                }
                closeMenu();
                return;
            }

            if (action === "add") {
                if (!isPlaylistFile(name)) {
                    alert("This file type cannot be added to playlist.");
                    closeMenu();
                    return;
                }

                const playlists = await playlists_load();
                const names = Object.keys(playlists);

                const choice = prompt(
                    "Add to which playlist?\n" +
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
                        alert(`Added "${name}" to playlist "${selectedName}".`);
                    }
                }
                closeMenu();
                return;
            }

            if (action === "load-subtitle") {
                if (typeof window.loadSubtitle === 'function') {
                    try {
                        await window.loadSubtitle(handle);
                        alert(`Subtitle "${name}" loaded.`);
                    } catch (err) {
                        console.error("Failed to load subtitle:", err);
                        alert("Failed to load subtitle.");
                    }
                } else {
                    alert("Subtitle loading not available.");
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
                    alert("Failed to export file.");
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
                const newName = prompt("New file name:", name);
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
                        alert("Failed to rename file.");
                    } finally {
                        if (writable) await writable.close();
                    }
                }
            }

            if (action === "delete" && canModify) {
                const ok = confirm(`Delete file "${name}"?`);
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
                        alert("Failed to delete file.");
                    }
                }
            }

            closeMenu();
        });
    });
}

function renderFileItem(subList, name, handle, entry, currentPath = "") {
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
                    alert(`Subtitle "${name}" loaded.`);
                } catch (err) {
                    console.error("Failed to load subtitle:", err);
                    alert("Failed to load subtitle.");
                }
            } else {
                alert("Subtitle loading not available.");
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
            // For external storage, check/request permission first
            if (entry.schema === "external_storage" && handle) {
                const hasPermission = await verifyPermission(handle);
                if (!hasPermission) {
                    alert("Permission denied for this directory.");
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

    // Case 1: navigator_storage → real FileSystemDirectoryHandle
    if (dirHandle && typeof dirHandle.entries === "function") {
        for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind === "directory") {
                dirs.push({ name, handle });
            } else if (handle.kind === "file") {
                files.push({ name, handle });
            }
        }
    }
    // Case 2: external_storage
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
        renderFileItem(subList, name, handle, entry, currentPath);
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
            }
            else
            {
                continue;
            }
        } catch {
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

        let message = `Imported ${result.count} file(s).`;
        if (result.errors.length > 0) {
            message += "\n\nSome items could not be copied:\n" + result.errors.join("\n");
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
    const confirmed = confirm(
        "This will permanently delete all imported directories:\n" +
        IMPORT_ROOTS.map(r => `• "${r.dirName}"`).join("\n") +
        "\n\nAre you sure you want to proceed?"
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
                else
                {
                    await rootDir.removeEntry(entry.dirName, { recursive: true });
                    removedAny = true;
                }
            } catch {
                // ignore missing directories
            }
        }

        alert(removedAny ? "All import folders have been removed." : "No import folders found.");
        renderStorage();
    } catch (err) {
        console.error(err);
        alert("Failed to clear imports.");
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
            errors.push(`Failed to import a file`);
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
            errors.push(`Failed to import ${filename}: ${err.message}`);
        }
    }

    renderStorage();

    let msg = `Imported ${count} file(s).`;
    if (errors.length > 0) {
        msg += "\n\nErrors:\n" + errors.join("\n");
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
    try {
        const dir = await window.showDirectoryPicker();
        const ok = await verifyPermission(dir);
        if (!ok) return;

        const name = dir.name;

        // Load existing external dirs
        let dirs = await kv_get("external_dirs") || {};

        // Prevent overwriting an existing entry
        if (dirs[name]) {
            alert(`External directory "${name}" already exists.`);
            return;
        }

        // Save new entry
        dirs[name] = dir;
        await kv_set("external_dirs", dirs);

        // Update in-memory cache
        window.externalStorageRoot = dirs;

        alert(`External directory "${name}" added.`);
        renderStorage();

    } catch (err) {
        console.error(err);
        alert("Failed to import external directory.");
    }
});

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
