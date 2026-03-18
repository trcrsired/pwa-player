// ============================================================
// Central definition of all import roots inside private storage
// ============================================================
//
// Each entry defines:
// - rootName: logical name used in pointer paths
// - dirName: actual directory name inside private storage
// - enabled: allows future toggling or feature flags
//
const IMPORT_ROOTS = [
    {
        schema: "navigator_storage",
        rootName: "imports",
        dirName: "imports",
        enabled: true
    },
    {
        schema: "navigator_storage",
        rootName: "files",
        dirName: "files",
        enabled: true
    },
    {
        schema: "external_storage",
        rootName: "external",
        dirName: "external",
        enabled: true
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

// Allowed media extensions (same as file_handlers)
const ALLOWED_EXTENSIONS = new Set([
    ".mp4", ".webm", ".mkv",
    ".mp3", ".wav", ".flac"
]);

function isAllowedFile(name) {
    // Ensure name is a non-empty string
    try
    {
        if (typeof name !== "string") return false;

        // Normalize
        const lower = name.trim().toLowerCase();
        if (!lower) return false;

        // Extract extension safely
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

            // Skip non-media files
            if (!isAllowedFile(name)) continue;

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
async function addDirectoryToPlaylist(rootDirHandle, schema, rootName, dirName, playlistName) {
    try {
        let targetDir;

        if (schema === "navigator_storage") {
            // navigator_storage: rootDirHandle is a real directory handle
            targetDir = await rootDirHandle.getDirectoryHandle(dirName, { create: false });

        } else if (schema === "external_storage") {
            // external_storage: rootDirHandle is a map of name → handle
            targetDir = rootDirHandle[dirName];

            if (!targetDir) {
                alert(`External directory "${dirName}" not found.`);
                return;
            }

            // Ensure permission is granted
            const ok = await verifyPermission(targetDir);
            if (!ok) {
                alert("Permission denied for external directory.");
                return;
            }

        } else {
            alert("Unknown storage schema.");
            return;
        }

        const basePath = `${rootName}/${dirName}`;
        const pointers = await collectPointers(targetDir, schema, basePath);

        if (pointers.length === 0) {
            alert(`No files found in "${dirName}".`);
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

function getSchemaForRoot(rootHandle) {
    // Private navigator.storage root
    if (rootHandle === window.navigatorStorageRoot) {
        return "navigator_storage";
    }

    // External SAF root
    if (rootHandle === window.externalStorageRoot) {
        return "external_storage";
    }

    // Fallback
    return "unknown";
}

function showStorageDirMenu(entry, dirName, x, y) {
    // Remove existing menu
    const existing = document.querySelector(".context-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";

    menu.innerHTML = `
        <div class="menu-item" data-action="add">Add to Playlist</div>
        <div class="menu-item" data-action="rename">Rename</div>
        <div class="menu-item danger" data-action="delete">Delete</div>
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

            const root = await navigator.storage.getDirectory();
            const parent = await root.getDirectoryHandle(entry.dirName);

            if (action === "add") {
                await choosePlaylistAndAdd(parent, entry, dirName);
            }

            if (action === "rename") {
                const newName = prompt("New folder name:", dirName);
                if (newName && newName.trim() && newName.trim() !== dirName) {
                    const trimmed = newName.trim();
                    const sourceDir = await parent.getDirectoryHandle(dirName);
                    const destDir = await parent.getDirectoryHandle(trimmed, { create: true });
                    await copyDirectoryToPrivateStorage(sourceDir, destDir);
                    await parent.removeEntry(dirName, { recursive: true });
                }
            }

            if (action === "delete") {
                const ok = confirm(`Delete folder "${dirName}"?`);
                if (ok) {
                    await parent.removeEntry(dirName, { recursive: true });
                }
            }

            closeMenu();
            renderStorage();
        });
    });
}
function renderSubdirItem(subList, name, handle, parentHandle, entry) {
    const li = document.createElement("li");
    li.className = "storage-sub-item";

    li.innerHTML = `
        <div class="storage-sub-header">
            <span class="sub-name">${escapeHTML(name)}</span>
            <button class="quick-add">+</button>
        </div>
    `;

    const header = li.querySelector(".storage-sub-header");
    const addBtn = li.querySelector(".quick-add");

    // Right-click context menu
    header.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showStorageDirMenu(entry, name, e.pageX, e.pageY);
    });

    // Quick add to playlist
    addBtn.addEventListener("click", async () => {
        await choosePlaylistAndAdd(parentHandle, entry, name);
    });

    // Click to expand/collapse subdirectories (recursive)
    header.addEventListener("click", async () => {
        let sub = li.querySelector("ul");
        if (!sub) {
            sub = document.createElement("ul");
            sub.className = "storage-sub hidden";
            li.appendChild(sub);
        }

        const hidden = sub.classList.toggle("hidden");
        if (!hidden) {
            await loadStorageSubdirs(sub, handle, entry);
        }
    });

    subList.appendChild(li);
}

async function loadStorageSubdirs(subList, dirHandle, entry) {
    // Clear previous content
    subList.innerHTML = "";

    // Case 1: navigator_storage → real FileSystemDirectoryHandle
    if (dirHandle && typeof dirHandle.entries === "function") {
        for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind !== "directory") continue;
            renderSubdirItem(subList, name, handle, dirHandle, entry);
        }
        return;
    }

    // Case 2: external_storage → dirHandle is a map of name → FileSystemDirectoryHandle
    if (entry.schema === "external_storage" && dirHandle && typeof dirHandle === "object") {
        for (const [name, handle] of Object.entries(dirHandle)) {
            renderSubdirItem(subList, name, handle, dirHandle, entry);
        }
        return;
    }

    console.warn("Unknown dirHandle type in loadStorageSubdirs:", dirHandle);
}
/*

async function renderStorageEntry(list, dirHandle, entry) {
    const schema = entry.schema;

    for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind !== "directory") continue;

        const li = document.createElement("li");

        const fullPath = `${schema}://${entry.rootName}/${name}`;

        const span = document.createElement("span");
        span.textContent = fullPath;

        const btn = document.createElement("button");
        btn.textContent = "+";
        btn.addEventListener("click", async () => {
            await choosePlaylistAndAdd(dirHandle, entry, name);
        });

        li.appendChild(span);
        li.appendChild(btn);
        list.appendChild(li);
    }
}
*/
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
            </div>
            <ul class="storage-sub hidden"></ul>
        `;

        const header = li.querySelector(".storage-header");
        const toggleBtn = li.querySelector(".toggle");
        const subList = li.querySelector(".storage-sub");

        // Click to expand/collapse
        header.addEventListener("click", () => {
            const hidden = subList.classList.toggle("hidden");
            toggleBtn.textContent = hidden ? "+" : "−";
            if (!hidden) loadStorageSubdirs(subList, rootDir, entry);
        });

        // Right-click menu
        header.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            showStorageDirMenu(entry, null, e.pageX, e.pageY);
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
