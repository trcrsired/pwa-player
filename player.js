function getAllViews() {
  return Array.from(document.querySelectorAll(".view"));
}

function getActiveView() {
  return getAllViews().find(v => !v.classList.contains("hidden")) || null;
}

function nop() {}

async function verifyPermission(fileHandle, mode = "read") {
  const opts = { mode };

  if (typeof fileHandle.queryPermission !== "function") {
    return true;
  }

  const permission = await fileHandle.queryPermission(opts);
  if (permission === "granted") {
    return true;
  }
  const request = await fileHandle.requestPermission(opts);
  return request === "granted";
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

const playerWrapper = document.getElementById("playerWrapper");
const video = document.getElementById("player");
const playBtn = document.getElementById("playBtn");
const npPlayBtn = document.getElementById("npPlayBtn");
const stopBtn = document.getElementById("stopBtn");
const npStopBtn = document.getElementById("npStopBtn");
const pickerBtn = document.getElementById("pickerBtn");
const volumeSlider = document.getElementById("volumeSlider");
const npVolumeSlider = document.getElementById("npVolumeSlider");
const timeDisplay = document.getElementById("timeDisplay");
const npTimeDisplay = document.getElementById("npTimeDisplay");
const progressBar = document.getElementById("progressBar");
const npProgressBar = document.getElementById("npProgressBar");
const rotationBtn = document.getElementById("rotationBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const controls = document.getElementById("controls");
const volumeToggleBtn = document.getElementById("volumeToggle");
const npVolumeToggleBtn = document.getElementById("npVolumeToggle");
const burgerBtn = document.getElementById('burgerBtn');
const configOptions = document.getElementById('configOptions');

function updateTimeDisplay(txtct)
{
  timeDisplay.textContent = txtct;
  npTimeDisplay.textContent = txtct;
}

async function play_source(sourceobject, playlist) {
  try {
    const result = await getMediaMetadataFromSource(sourceobject);
    if (!result) {
      return;
    }

    const blobURL = result[1];
    const mediametadata = result[2];

    video.src = blobURL;
    controls.classList.add('hidden');
    video.play();
    playBtn.textContent = "⏸️";

    navigator.mediaSession.metadata = new MediaMetadata(mediametadata);
    document.title = `PWA Player ▶️ ${mediametadata.title}`;

    // Build entry for Now Playing UI
    const entry = {
        name: mediametadata.title,
        artist: mediametadata.artist || "",
        path: playlist?.entryPath || blobURL
    };

    // Update Now Playing UI
    updateNowPlayingInfo(entry);

    // Save playback state
    if (playlist) {
        // Playing from a playlist:
        // - clear lastplayed
        // - save lastplaylist
        kv_delete("lastplayed").catch(() => {});
        kv_set("lastplaylist", playlist).catch(() => {});
    } else {
        // Playing a single file:
        // Only save lastplayed if there is no existing lastplaylist.
        // This prevents overwriting playlist resume state.
      const lp = await kv_get("lastplaylist");
      if (!lp) {
          kv_set("lastplayed", sourceobject).catch(() => {});
      }
    }
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

async function togglePlayBtn()
{
    // If a video is already loaded → toggle play/pause
    if (video.src) {
        if (video.readyState < 3) return;
        video.paused ? video.play() : video.pause();
        playBtn.textContent = video.paused ? "▶️" : "⏸️";
        npPlayBtn.textContent = playBtn.textContent;
        return;
    }
    // Try to restore last playlist or last file
    const restored = await restoreLastPlayback();
    if (restored) return;
    // Nothing to restore → open picker
    pickerBtn.click();
}

playBtn.onclick = togglePlayBtn;
npPlayBtn.onclick = togglePlayBtn;

async function toggleStopBtn()
{
  video.pause();
  video.currentTime = 0;
  video.removeAttribute("src");
  video.load();
  playBtn.textContent = "▶️";
  npPlayBtn.textContent = playBtn.textContent;
  navigator.mediaSession.metadata = new MediaMetadata({});
  document.title = `PWA Player`;
}

stopBtn.onclick = toggleStopBtn;
npStopBtn.onclick = toggleStopBtn;

function pickFileSafariFallback(accept = "*/*") {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;

    input.onchange = () => resolve(input.files[0]);
    input.click();
  });
}

pickerBtn.onclick = async (e) => {
  try {
    let file;

    if (typeof window.showOpenFilePicker === "function") {
      // Modern browsers (Chrome / Edge)
      const [handle] = await window.showOpenFilePicker({
        startIn: 'videos'
      });
      file = handle; // pass handle to your existing logic
    } else {
      // Safari / Firefox fallback
      file = await pickFileSafariFallback("video/*");
    }

    play_source(file).catch(nop);
  } catch (err) {
    if (video.src && video.currentTime > 0) {
      toggleStopBtn(); // Only stop if something's playing
    }
  }
};

webBtn.onclick = () => {
  try {
    const url = prompt("Enter web URL:");

    if (url)
    {
      play_source(url).catch(nop);
    }
  }
  catch (err) {
      console.warn("web picker cancelled or failed:", err);
      if (video.src && video.currentTime > 0) {
          toggleStopBtn(); // Only stop if something's playing
      }
  }
};

function volumeSliderInput(objVolumeSlider)
{
  const percent = parseInt(objVolumeSlider.value, 10); // raw percent
  const normalized = Math.min(1, Math.max(0, percent / 100));

  if (volumeToggleBtn.textContent.trim() === "🔊") {
    player.volume = normalized;
  }
}

volumeSlider.addEventListener("input", () => {
  volumeSliderInput(volumeSlider);
});

npVolumeSlider.addEventListener("input", () => {
  volumeSliderInput(npVolumeSlider);
});

function volumeToggleBtnClick()
{
  if (volumeToggleBtn.textContent.trim() === "🔊") {
    video.volume = 0;
    volumeToggleBtn.textContent = "🔇";
  } else {
    const percent = parseInt(volumeSlider.value, 10); // raw percent
    const normalized = Math.min(1, Math.max(0, percent / 100));
    player.volume = normalized;
    volumeToggleBtn.textContent = "🔊";
  }
  npVolumeToggleBtn.textContent = volumeToggleBtn.textContent;
}

// Toggle visibility on button click
volumeToggleBtn.addEventListener("click", volumeToggleBtnClick);
npVolumeToggleBtn.addEventListener("click", volumeToggleBtnClick);

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
    updateTimeDisplay("00:00 / 00:00");
    progressBar.max = 0;
    progressBar.value = 0;
    npProgressBar.max = 0;
    npProgressBar.value = 0;
    return;
  }
  const currentTime = video.currentTime;
  const current = formatTime(currentTime);

  let total = null;
  if (Number.isFinite(video.duration) && video.duration > 0) {
      total = formatTime(video.duration);
  }

  if (total) {
      updateTimeDisplay(`${current} / ${total}`);
  } else {
      updateTimeDisplay(current);
  }
  progressBar.max = duration;
  progressBar.value = currentTime;
  npProgressBar.max = duration;
  npProgressBar.value = currentTime;
});

function fullscreencallback()
{
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
    controls.classList.toggle('hidden');
  }
}

fullscreenBtn.onclick = fullscreencallback;

progressBar.oninput = () => {
  video.currentTime = progressBar.value;
};
npProgressBar.oninput = () => {
  video.currentTime = npProgressBar.value;
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
    playBtn.textContent = video.paused ? "▶️" : "⏸️";
    npPlayBtn.textContent = playBtn.textContent;
  }

  let hideTimeout;

  function showControlsTemporarily() {
    // Show controls and cursor
    controls.classList.remove("hidden");
    playerWrapper.classList.remove("hide-cursor");

    clearTimeout(hideTimeout);

    hideTimeout = setTimeout(() => {
      controls.classList.add("hidden");
      playerWrapper.classList.add("hide-cursor");
    }, 3000);
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

