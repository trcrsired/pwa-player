class SimpleKVStore {
  constructor(dbName = "KVStore", storeName = "kv", version = 1) {
    this.dbName = dbName;
    this.storeName = storeName;
    this.version = version;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  async set(key, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async get(key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, "readonly");
      const request = tx.objectStore(this.storeName).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async delete(key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async keys() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js")
    .catch((err) => console.error("Service Worker failed:", err));
}

let kv_async = new SimpleKVStore("pwaplayerdb", "videos")
let kv_sync;

async function kv_get(key)
{
  if (!kv_sync)
  {
    kv_sync = await kv_async.init();
  }
  return await kv_sync.get(key);
}

async function kv_set(key, value)
{
  if (!kv_sync)
  {
    kv_sync = await kv_async.init();
  }
  return await kv_sync.set(key, value);
}

function nop(){}

function wipe(target) {
  if (Array.isArray(target)) {
    target.length = 0;
  } else if (typeof target === 'object' && target !== null) {
    Object.keys(target).forEach(key => delete target[key]);
  }
}
async function verifyPermission(fileHandle, mode = "read") {
  const opts = { mode };
  if ((await fileHandle.queryPermission(opts)) === "granted") {
    return true;
  }
  return (await fileHandle.requestPermission(opts)) === "granted";
}

async function getMediaMetadataFromSource(sourceobject) {
  let blobURL = null;
  let mediasource = {}
  if (sourceobject instanceof FileSystemFileHandle) {
    if (! await verifyPermission(sourceobject)) return null;

    const file = await sourceobject.getFile();
    blobURL = URL.createObjectURL(file);
    mediasource.title = file.name;
  } else if (sourceobject instanceof File || sourceobject instanceof Blob || sourceobject instanceof MediaSource) {
    blobURL = URL.createObjectURL(sourceobject);
    mediasource.title = sourceobject.name || null;
  } else if (typeof sourceobject === "string") {
    blobURL = sourceobject;
    fileName = sourceobject.split("/").pop()?.split("?")[0] || null;
    mediasource.title = fileName;
  } else {
    console.warn("Unsupported sourceobject type:", sourceobject);
    return null;
  }

  return [
  sourceobject,
  blobURL,
  mediasource,
  ];
}

document.addEventListener("DOMContentLoaded", () => {
  const video = document.getElementById("player");
  const playBtn = document.getElementById("playBtn");
  const stopBtn = document.getElementById("stopBtn");
  const pickerBtn = document.getElementById("pickerBtn");
  const volumeSlider = document.getElementById("volumeSlider");
  const timeDisplay = document.getElementById("timeDisplay");
  const progressBar = document.getElementById("progressBar");
  const rotationBtn = document.getElementById("rotationBtn");
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const controls = document.getElementById("controls");
  const volumeToggleBtn = document.getElementById("volumeToggle");
  const burgerBtn = document.getElementById('burgerBtn');
  const configOptions = document.getElementById('configOptions');

  async function play_source(sourceobject)
  {
    try {
      const result = await getMediaMetadataFromSource(sourceobject);
      if (!result)
      {
        return;
      }
      const sourceobj = result[0];
      const blobURL = result[1];
      const mediametadata = result[2];
      video.src = blobURL;
      controls.classList.remove("hidden");
      video.play();
      playBtn.textContent = "⏸️";
      // Save it into the indexedDB
      kv_set("lastplayed", sourceobject).then(nop).catch(nop);
      navigator.mediaSession.metadata = new MediaMetadata(mediametadata);
      document.title = `PWA Player ▶️ ${mediametadata.title}`;
    }
    catch(err)
    {

    }
  }

  const player = video;
  const container = document.getElementById("playerContainer");

  ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
      window.addEventListener(eventName, e => e.preventDefault());
  });

  window.addEventListener("dragover", () => {
      container.style.outline = "3px dashed #4caf50";
  });

  window.addEventListener("dragleave", () => {
      container.style.outline = "none";
  });

  window.addEventListener("drop", e => {
      container.style.outline = "none";

      const file = e.dataTransfer.files[0];
      if (!file) return;

      if (
          !file.type.startsWith("video/") &&
          !file.type.startsWith("audio/")
      ) {
          alert("Please drop a video or audio file");
          return;
      }

      play_source(file);
  });

  playBtn.onclick = async () => {
    if (!video.src)
    {
      const lastplayed = await kv_get("lastplayed");
      if (lastplayed)
      {
        play_source(lastplayed).catch(nop);
        return;
      }
      pickerBtn.click();
      return;
    }
    if (video.readyState < 3) return;
    video.paused ? video.play() : video.pause();
    playBtn.textContent = video.paused ? "▶️" : "⏸️";
  };

  stopBtn.onclick = () => {
    video.pause();
    video.currentTime = 0;
    video.removeAttribute("src");
    video.load();
    playBtn.textContent = "▶️";
    navigator.mediaSession.metadata = new MediaMetadata({});
    document.title = `PWA Player`;
  };


  pickerBtn.onclick = async (e) => {
    try {
        const [handle] = await window.showOpenFilePicker(
          {
            startIn: 'videos'
          }
        );
        play_source(handle).catch(nop);
    }
    catch (err) {
        if (video.src && video.currentTime > 0) {
            stopBtn.onclick(); // Only stop if something's playing
        }
    }
  };
  webBtn.onclick = () => {
    try {
      const url = prompt("Enter video URL:");

      if (url)
      {
        play_source(url).catch(nop);
      }
    }
    catch (err) {
        console.warn("web picker cancelled or failed:", err);
        if (video.src && video.currentTime > 0) {
            stopBtn.onclick(); // Only stop if something's playing
        }
    }
  };
  volumeSlider.addEventListener("input", () => {
    const percent = parseInt(volumeSlider.value, 10); // raw percent
    const normalized = Math.min(1, Math.max(0, percent / 100));

    if (volumeToggleBtn.textContent.trim() === "🔊") {
      player.volume = normalized;
    }
  });

  // Toggle visibility on button click
  volumeToggleBtn.addEventListener("click", () => {
    if (volumeToggleBtn.textContent.trim() === "🔊") {
      video.volume = 0;
      volumeToggleBtn.textContent = "🔇";
    } else {
      const percent = parseInt(volumeSlider.value, 10); // raw percent
      const normalized = Math.min(1, Math.max(0, percent / 100));
      player.volume = normalized;
      volumeToggleBtn.textContent = "🔊";
    }
  });

  rotationBtn.addEventListener("click", () => {
    const orientation = screen?.orientation;
    if (!orientation || !orientation.lock) return;

    const current = orientation.type;

    if (current.startsWith("portrait")) {
      orientation.lock("landscape").catch((err) => {
        console.warn("Rotation failed:", err);
      });
    } else if (current.startsWith("landscape")) {
      orientation.lock("portrait").catch((err) => {
      });
    }
  });

  video.addEventListener("timeupdate", () => {
    const duration = video.duration;
    if (!video.src || Number.isNaN(duration))
    {
      timeDisplay.textContent = "00:00 / 00:00";
      progressBar.max = 0;
      progressBar.value = 0;
      return;
    }
    const currentTime = video.currentTime;
    const current = formatTime(currentTime);
    const total = formatTime(duration);
    timeDisplay.textContent = `${current} / ${total}`;
    progressBar.max = duration;
    progressBar.value = currentTime;
  });

  function fullscreencallback()
  {
    const container = document.getElementById("playerContainer");
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
      controls.classList.toggle('hidden');
    }
  }

  fullscreenBtn.onclick = fullscreencallback;

  progressBar.oninput = () => {
    video.currentTime = progressBar.value;
  };
document.addEventListener("keydown", (e) => {
  const video = document.getElementById("player");

  switch (e.code) {
    case "Enter":
    case "Space":
      togglePlay(video);
      e.preventDefault(); // prevent scroll or default behavior
      break;

    case "ArrowRight":
      if (video.readyState >= 3 && video.src) {
        video.currentTime = Math.min(video.duration, video.currentTime + 5);
      }
      break;

    case "ArrowLeft":
      if (video.readyState >= 3 && video.src) {
        video.currentTime = Math.max(0, video.currentTime - 5);
      }
      break;
      case "KeyF":
        fullscreencallback();
      break;
    // optional: Esc to exit fullscreen
    case "Escape":
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
      break;
  }
});

  function formatTime(seconds) {
    const min = Math.floor(seconds / 60).toString().padStart(2, "0");
    const sec = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${min}:${sec}`;
  }

  // Toggle play/pause logic
  function togglePlay(video) {
    if (video.readyState < 3 || !video.src) return;
    video.paused ? video.play() : video.pause();
    document.getElementById("playBtn").textContent = video.paused ? "▶️" : "⏸️";
  }

  let hideTimeout;

  function showControlsTemporarily() {
    controls.classList.remove("hidden");
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      controls.classList.add("hidden");
    }, 3000); // Hide after 3 seconds
  }
/*
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(controls.contains(target)|| volumePanel.contains(target))) {
        const video = document.getElementById("player");
        togglePlay(video);
    }
  });
*/
  player.addEventListener("pointermove", (e) => {
    const target = e.target;
    if (controls.contains(target)) {
      controls.classList.remove("hidden");
      clearTimeout(hideTimeout);
    }
    else
    {
      showControlsTemporarily();
    }
  });

  burgerBtn.addEventListener('click', () => {
    if (configOptions.classList.contains('hidden')) {
      configOptions.classList.remove('hidden');
    } else {
      configOptions.classList.add('hidden');
    }
  });


// 🎵 Playlist Elements
const playlistBtn = document.getElementById('playlistBtn');
const playlistOverlay = document.getElementById('playlistOverlay');
const closePlaylistBtn = document.getElementById('closePlaylistBtn');
const playlistItems = document.getElementById('playlistItems');
const addTrackBtn = document.getElementById('addTrackBtn');

// 🗂️ Storage Elements
const storageBtn = document.getElementById('storageBtn');
const storageOverlay = document.getElementById('storageOverlay');
const closeStorageBtn = document.getElementById('closestorageBtn');
const storageItems = document.getElementById('storageItems');
const addImportBtn = document.getElementById('addTrackBtn'); // same ID reused

// 🎵 Playlist Logic
playlistBtn.addEventListener('click', () => {
  playlistOverlay.classList.remove('hidden');
});

closePlaylistBtn.addEventListener('click', () => {
  playlistOverlay.classList.add('hidden');
});

let playlist = [];

function renderPlaylist() {
  playlistItems.innerHTML = '';
  playlist.forEach((track, index) => {
    const li = document.createElement('li');
    li.textContent = track.name || `Track ${index + 1}`;
    playlistItems.appendChild(li);
  });
}

addTrackBtn.addEventListener('click', () => {
  const newTrack = { name: `New Track ${playlist.length + 1}` };
  playlist.push(newTrack);
  renderPlaylist();
});

const folderOverlay = document.getElementById('folderOverlay');
const folderFileList = document.getElementById('folderFileList');
const closeFolderBtn = document.getElementById('closeFolderBtn');

let currentFolderHandle = null;
let selectedFiles = new Set();

// Close overlay
closeFolderBtn.addEventListener('click', () => {
  folderOverlay.classList.add('hidden');
  selectedFiles.clear();
  folderFileList.innerHTML = '';
});

// Main function to open folder and render file list
async function enterImportDir(dirHandle, label = '') {
  currentFolderHandle = dirHandle;
  selectedFiles.clear();
  folderFileList.innerHTML = '';
  folderOverlay.classList.remove('hidden');

  async function walk(handle, path = '') {
    for await (const [name, entry] of handle.entries()) {
      const fullPath = path ? `${path}/${name}` : name;

      if (entry.kind === 'file' && name.toLowerCase().endsWith('.webm')) {
        const li = document.createElement('li');
        li.classList.add('file-entry');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            selectedFiles.add(fullPath);
          } else {
            selectedFiles.delete(fullPath);
          }
        });

        li.appendChild(checkbox);
        li.appendChild(document.createTextNode(` ${fullPath}`));
        folderFileList.appendChild(li);
      } else if (entry.kind === 'directory') {
        const subDir = await handle.getDirectoryHandle(name);
        await walk(subDir, fullPath);
      }
    }
  }

  await walk(dirHandle);
}


async function renderStorage() {
  storageItems.innerHTML = '';

  try {
    const privateRoot = await navigator.storage.getDirectory();
    const importsDir = await privateRoot.getDirectoryHandle('imports', { create: true });

    for await (const [name, handle] of importsDir.entries()) {
      if (handle.kind === 'directory') {
        const li = document.createElement('li');
        li.textContent = name;
        li.classList.add('storage-folder-item');
        li.title = 'Click to open folder manager';

        li.addEventListener('click', () => {
          enterImportDir(handle, name);
        });

        storageItems.appendChild(li);
      }
    }
  } catch (err) {
    console.error('Failed to render storage imports:', err);
    const li = document.createElement('li');
    li.textContent = '⚠️ Unable to access private storage.';
    storageItems.appendChild(li);
  }
}

// 🗂️ Storage Logic
storageBtn.addEventListener('click', () => {
  storageOverlay.classList.remove('hidden');
  renderStorage();
});

closeStorageBtn.addEventListener('click', () => {
  storageOverlay.classList.add('hidden');
});


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

  while (attempts != 3) {
    const name = prompt(`Directory "${baseName}" already exists.\nEnter a new name (no slashes):`, baseName);
    if (name === null) return null; // Cancelled

    const trimmed = name.trim();
    if (!trimmed || trimmed.includes('/')) {
      alert('Invalid name. Directory names must not be empty or contain slashes.');
      return null;
    }

    if (trimmed === baseName) {
      ++attempts;
      alert(`"${baseName}" already exists. Please choose a different name.`);
      continue;
    }

    if (!(await dirExists(trimmed, importsDirHandle))) {
      return trimmed;
    }

    ++attempts;
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
      await copyDirectoryToPrivateStorage(handle, newDirHandle); // recursive
    }
  }
}

addImportBtn.addEventListener('click', async () => {
  try {
    const sourceDir = await window.showDirectoryPicker({
        startIn: 'music'
      });
    const permission = await verifyPermission(sourceDir);
    if (!permission) return;

    const privateRoot = await navigator.storage.getDirectory();
    const importsDir = await privateRoot.getDirectoryHandle('imports', { create: true });

    let targetName = sourceDir.name;
    if (await dirExists(targetName, importsDir)) {
      targetName = await promptForUniqueName(targetName, importsDir);
      if (!targetName) return; // Cancelled or invalid
    }

    const targetDir = await importsDir.getDirectoryHandle(targetName, { create: true });
    await copyDirectoryToPrivateStorage(sourceDir, targetDir);

    renderStorage();
  } catch (err) {
  }
});

document.getElementById('clearImports').addEventListener('click', async () => {
  const confirmed = confirm(
    '⚠️ This will permanently delete all imported directories and the entire "imports" folder.\n\nAre you sure you want to proceed?'
  );
  if (!confirmed) return;

  try {
    const rootDir = await navigator.storage.getDirectory();

    // Check if 'imports' exists
    let importsExists = false;
    for await (const [name, handle] of rootDir.entries()) {
      if (name === 'imports' && handle.kind === 'directory') {
        importsExists = true;
        break;
      }
    }

    if (!importsExists) {
      alert('No "imports" folder found. Nothing to clear.');
      return;
    }

    // Remove 'imports' folder recursively
    await rootDir.removeEntry('imports', { recursive: true });

    alert('✅ All imported directories and the "imports" folder have been removed.');
    renderStorage(); // Refresh UI
  } catch (err) {
    console.error('❌ Failed to clear imports folder:', err);
    alert('❌ Failed to clear imports. See console for details.');
  }
});

if ('launchQueue' in window) {
  launchQueue.setConsumer(async (launchParams) => {
    for (const fileHandle of launchParams.files) {
      const file = await fileHandle.getFile();
      play_source(file);
      return;
      // Route to appropriate player logic
    }
  });
}
});

