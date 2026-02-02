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

        attempts++;
        alert(`"${trimmed}" already exists. Try again.`);
    }

    alert("Too many attempts. Import cancelled.");
    return null;
}

// ============================================================
// Copy a directory (from SAF) into private storage
// ============================================================
async function copyDirectoryToPrivateStorage(sourceHandle, targetHandle, result = { count: 0, errors: [] }) {
    for await (const [name, handle] of sourceHandle.entries()) {
        try {
            if (handle.kind === "file") {
                // SAF read (may fail on Android)
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
        const targetDir = await rootDirHandle.getDirectoryHandle(dirName, { create: false });
        const basePath = `${rootName}/${dirName}`;

        const pointers = await collectPointers(targetDir, schema, basePath);

        if (pointers.length === 0) {
            alert(`No files found in "${dirName}".`);
            return;
        }

        const playlists = await playlists_load();
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


// ============================================================
// Render all import roots and their subdirectories
// ============================================================
async function renderStorage() {
    const list = document.getElementById("storageList");
    list.innerHTML = "";

    if (!window.navigatorStorageRoot) {
        window.navigatorStorageRoot = await navigator.storage.getDirectory();
    }

    const root = window.navigatorStorageRoot;

    for (const entry of IMPORT_ROOTS) {
        if (!entry.enabled) continue;

        let rootDir;
        try {
            rootDir = await root.getDirectoryHandle(entry.dirName);
        } catch {
            continue;
        }

        await renderStorageEntry(list, rootDir, entry, root);
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
                await rootDir.removeEntry(entry.dirName, { recursive: true });
                removedAny = true;
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
    document.getElementById("storageView").classList.add("hidden");
    document.getElementById("playerContainer").classList.remove("hidden");
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
        try {
            const targetFileHandle = await targetDir.getFileHandle(file.name, { create: true });
            const writable = await targetFileHandle.createWritable();
            await writable.write(await file.arrayBuffer());
            await writable.close();
            ++count;
        } catch (err) {
            errors.push(`Failed to import ${file.name}: ${err.message}`);
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
