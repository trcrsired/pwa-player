function getAllViews() {
  return Array.from(document.querySelectorAll(".view"));
}

function getActiveView() {
  return getAllViews().find(v => !v.classList.contains("hidden")) || null;
}

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

// Playback modes
const PLAY_MODES = ["once", "repeat", "repeat-one", "shuffle"];

// Default mode is Shuffle
let playMode = "shuffle";

// Update button text
function updatePlayModeButton() {
    const btn = document.getElementById("playModeBtn");

    switch (playMode) {
        case "once":
            btn.textContent = "➡️";
            break;
        case "repeat":
            btn.textContent = "🔁";
            break;
        case "repeat-one":
            btn.textContent = "🔂1";
            break;
        case "shuffle":
            btn.textContent = "🔀";
            break;
    }
}

async function loadPlayMode() {
    const saved = await kv_get("playMode");
    if (saved && PLAY_MODES.includes(saved)) {
        playMode = saved;
    } else {
        playMode = "shuffle"; // default
    }
    updatePlayModeButton();
    return playMode;
}

// Cycle playback mode
document.getElementById("playModeBtn").addEventListener("click", () => {
    const index = PLAY_MODES.indexOf(playMode);
    playMode = PLAY_MODES[(index + 1) % PLAY_MODES.length];
    kv_set("playMode", playMode);

    updatePlayModeButton();
});

loadPlayMode();

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

async function play_source(sourceobject, playlist) {
  try {
    const result = await getMediaMetadataFromSource(sourceobject);
    if (!result) {
      return;
    }

    const sourceobj = result[0];
    const blobURL = result[1];
    const mediametadata = result[2];

    video.src = blobURL;
    controls.classList.remove("hidden");
    video.play();
    playBtn.textContent = "⏸️";

    // Save playback state
    if (playlist) {
      // Playing from a playlist:
      // - clear lastplayed
      // - save lastplaylist
      kv_delete("lastplayed").catch(() => {});
      kv_set("lastplaylist", playlist).catch(() => {});
    } else {
      // Playing a single file:
      // - clear lastplaylist
      // - save lastplayed
      kv_delete("lastplaylist").catch(() => {});
      kv_set("lastplayed", sourceobject).catch(() => {});
    }

    navigator.mediaSession.metadata = new MediaMetadata(mediametadata);
    document.title = `PWA Player ▶️ ${mediametadata.title}`;
  }
  catch (err) {
    console.warn(err);
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
    // If a video is already loaded → toggle play/pause
    if (video.src) {
        if (video.readyState < 3) return;
        video.paused ? video.play() : video.pause();
        playBtn.textContent = video.paused ? "▶️" : "⏸️";
        return;
    }

    // Try to restore last playlist or last file
    const restored = await restoreLastPlayback();
    if (restored) return;

    // Nothing to restore → open picker
    pickerBtn.click();
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
  const activeView = getActiveView();

  if (activeView) {
    if (e.code === "Escape") {
      activeView.classList.add("hidden");
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

video.addEventListener("ended", () => {
    switch (playMode) {
        case "once":
            // Do nothing
            break;

        case "repeat-one":
            video.currentTime = 0;
            video.play();
            break;

        case "repeat":
        case "shuffle":
            // Placeholder: will call playNext() later
            playNext();
            break;
    }
});

document.getElementById('storageBtn').addEventListener('click', () => {
  document.getElementById("storageView").classList.remove("hidden");
  document.getElementById("playerContainer").classList.add("hidden");
});

document.getElementById('nowPlayingBtn').addEventListener('click', () => {
  document.getElementById("nowPlayingView").classList.remove("hidden");
  document.getElementById("playerContainer").classList.add("hidden");
});

/*

// Open Now Playing view
document.getElementById("nowPlayingBtn").addEventListener("click", () => {
    document.getElementById("nowPlayingView").classList.remove("hidden");
    document.getElementById("playerContainer").classList.add("hidden");

    nowPlaying_load();
    nowPlaying_renderQueue();
});
*/

// Back button
document.getElementById("nowPlayingBackBtn").addEventListener("click", () => {
    document.getElementById("nowPlayingView").classList.add("hidden");
    document.getElementById("playerContainer").classList.remove("hidden");
});

