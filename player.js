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
    .then(() => console.log("✅ Service Worker registered"))
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
  return await kv_sync.set(key, value, { overwrite: true });
}

function nop(){}

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

  async function play_source(sourceobject)
  {
    console.log("sourceobject=",sourceobject);
    try {
      let blobURL = null;
      let lastplayed_val = null;

      // Check if we got a FileSystemFileHandle
      if (sourceobject instanceof FileSystemFileHandle) {
        const permission = await sourceobject.requestPermission({ mode: "read" });
        if (permission !== "granted") return;

        const file = await sourceobject.getFile();
        lastplayed_val = file;
        blobURL = URL.createObjectURL(file);

        // You *can't* store FileSystemFileHandle directly in localStorage
        // Consider using IndexedDB if you want persistence
      } else if (sourceobject instanceof Blob || sourceobject instanceof File || sourceobject instanceof MediaSource) {
        lastplayed_val = sourceobject;
        blobURL = URL.createObjectURL(sourceobject);
      } else if (typeof sourceobject === "string") {
        lastplayed_val = sourceobject;
        blobURL = sourceobject; // For remote URLs
      } else {
        console.warn("Unsupported sourceobject type:", sourceobject);
        return;
      }

      video.src = blobURL;
      controls.classList.remove("hidden");
      video.play();
      playBtn.textContent = "⏸️";

      // Save it into the indexedDB
      kv_set("lastplayed", lastplayed_val).then(nop).catch(nop);
    }
    catch(err)
    {

    }
  }
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
  };


  pickerBtn.onclick = async (e) => {
    try {
        const [handle] = await window.showOpenFilePicker();
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
  volumeSlider.oninput = () => {
    video.volume = volumeSlider.value;
  };

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

  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!controls.contains(target)) {
        const video = document.getElementById("player");
        togglePlay(video);
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
    }, 2000); // Hide after 2 seconds
  }


  player.addEventListener("pointermove", (e) => {
    if (controls.contains(e.target)) {
      controls.classList.remove("hidden");
      clearTimeout(hideTimeout);
    }
    else
    {
      showControlsTemporarily();
    }
  });

});

