const views = ["storageView", "settingsView", "aboutView", "playlistView"];

function nop() {}

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
  const is_escape = (e.code === "Escape");
  let has_views = false;
  for (const id of views) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains("hidden")) {
      has_views = true;
      if (is_escape)
      {
        el.classList.add("hidden");
      }
    }
  }
  if (has_views)
  {
    if (is_escape)
    {
      document.getElementById("playerContainer").classList.remove("hidden");
    }
    return;
  }
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


document.getElementById('storageBtn').addEventListener('click', () => {
    document.getElementById("storageView").classList.remove("hidden");
    document.getElementById("playerContainer").classList.add("hidden");
});
