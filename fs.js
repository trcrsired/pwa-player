async function dirExists(name, parentHandle) {
    try {
        await parentHandle.getDirectoryHandle(name, { create: false });
        return true;
    } catch {
        return false;
    }
}

async function promptForUniqueName(baseName, importsDirHandle) {
    let attempts = 0;

    while (attempts < 3) {
        const name = prompt(
            `Directory "${baseName}" already exists.\nEnter a new name (no slashes):`,
            baseName
        );

        if (name === null) return null;

        const trimmed = name.trim();
        if (!trimmed || trimmed.includes('/')) {
            alert('Invalid name. Directory names must not be empty or contain slashes.');
            return null;
        }

        if (trimmed === baseName) {
            attempts++;
            alert(`"${baseName}" already exists. Please choose a different name.`);
            continue;
        }

        if (!(await dirExists(trimmed, importsDirHandle))) {
            return trimmed;
        }

        attempts++;
        alert(`"${trimmed}" already exists. Try again.`);
    }

    alert('Too many attempts. Import cancelled.');
    return null;
}

async function copyDirectoryToPrivateStorage(sourceHandle, targetHandle) {
    for await (const [name, handle] of sourceHandle.entries()) {
        if (handle.kind === 'file') {
            if (!name.toLowerCase().endsWith('.webm')) continue;

            const file = await handle.getFile();
            const targetFileHandle = await targetHandle.getFileHandle(name, { create: true });
            const writable = await targetFileHandle.createWritable();
            await writable.write(await file.arrayBuffer());
            await writable.close();
        } else if (handle.kind === 'directory') {
            const newDirHandle = await targetHandle.getDirectoryHandle(name, { create: true });
            await copyDirectoryToPrivateStorage(handle, newDirHandle);
        }
    }
}

async function renderStorage() {
    const list = document.getElementById('storageList');
    list.innerHTML = '';

    const root = await navigator.storage.getDirectory();
    let importsDir;

    try {
        importsDir = await root.getDirectoryHandle('imports');
    } catch {
        return;
    }

    for await (const [name, handle] of importsDir.entries()) {
        if (handle.kind === 'directory') {
            const li = document.createElement('li');
            li.textContent = name;
            list.appendChild(li);
        }
    }
}

document.getElementById('addImportBtn').addEventListener('click', async () => {
    try {
        const sourceDir = await window.showDirectoryPicker({ startIn: 'music' });
        const permission = await verifyPermission(sourceDir);
        if (!permission) return;

        const privateRoot = await navigator.storage.getDirectory();
        const importsDir = await privateRoot.getDirectoryHandle('imports', { create: true });

        let targetName = sourceDir.name;
        if (await dirExists(targetName, importsDir)) {
            targetName = await promptForUniqueName(targetName, importsDir);
            if (!targetName) return;
        }

        const targetDir = await importsDir.getDirectoryHandle(targetName, { create: true });
        await copyDirectoryToPrivateStorage(sourceDir, targetDir);

        renderStorage();
    } catch (err) {
        console.error(err);
    }
});
