function getAllViews() {
  return Array.from(document.querySelectorAll(".overlay-view"));
}

function getActiveView() {
  return getAllViews().find(v => !v.classList.contains("hidden")) || null;
}

function switchView(viewId) {
  document.getElementById(viewId).classList.remove("hidden");
  document.getElementById("playerContainer").classList.add("hidden");
}

function closeActiveView() {
  const view = getActiveView();
  if (view) {
    view.classList.add("hidden");
    document.getElementById("playerContainer").classList.remove("hidden");
  }
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
    const fileName = sourceobject.split("/").pop()?.split("?")[0] || null;
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
let hasActiveSource = false;
let currentBlobURL = null;

function revokeBlobURL() {
  if (currentBlobURL && currentBlobURL.startsWith("blob:")) {
    URL.revokeObjectURL(currentBlobURL);
  }
  currentBlobURL = null;
}
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
const advancedControls = document.getElementById('advancedControls');
const subtitleBtn = document.getElementById('subtitleBtn');

function updateTimeDisplay(txtct)
{
  timeDisplay.textContent = txtct;
  npTimeDisplay.textContent = txtct;
}

async function play_source_internal(blobURL, mediametadata, sourceobject, playlist) {
  try {
    revokeBlobURL();
    currentBlobURL = blobURL;

    video.src = blobURL;
    hasActiveSource = true;
    controls.classList.add('hidden');

    // Clear previous subtitles
    const existingTracks = video.querySelectorAll('track');
    existingTracks.forEach(t => {
      if (t.src.startsWith('blob:')) URL.revokeObjectURL(t.src);
      t.remove();
    });
    subtitleBtn.textContent = '📝';

    // 🔥 Fix: wait for metadata before playing
    video.onloadedmetadata = () => {
      video.play().catch(err => console.warn("Play failed:", err));
    };

    playBtn.textContent = "⏸️";

    navigator.mediaSession.metadata = new MediaMetadata(mediametadata);
    document.title = `PWA Player ▶️ ${mediametadata.title}`;

    const entry = {
      name: mediametadata.title,
      artist: mediametadata.artist || "",
      path: playlist?.entryPath || blobURL
    };

    updateNowPlayingInfo(entry);

    if (playlist) {
      kv_delete("lastplayed").catch(() => {});
      kv_set("lastplaylist", playlist).catch(() => {});
    } else {
      const lp = await kv_get("lastplaylist");
      if (!lp) {
        kv_set("lastplayed", sourceobject).catch(() => {});
      }
    }
  } catch (err) {
    console.warn(err);
  }
}

async function play_source_title(sourceobject, customTitle, playlist) {
  try {
    // Get metadata as usual
    const result = await getMediaMetadataFromSource(sourceobject);
    if (!result) return;

    const blobURL = result[1];
    const mediametadata = result[2];

    // Override the title
    mediametadata.title = customTitle;

    // Now call the internal playback handler
    await play_source_internal(blobURL, mediametadata, sourceobject, playlist);
  } catch (err) {
    console.warn(err);
  }
}

async function play_source(sourceobject, playlist) {
  try {
    const result = await getMediaMetadataFromSource(sourceobject);
    if (!result) return;

    const blobURL = result[1];
    const mediametadata = result[2];

    // Call the shared internal logic
    await play_source_internal(blobURL, mediametadata, sourceobject, playlist);

  } catch (err) {
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
    if (hasActiveSource) {
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
  hasActiveSource = false;
  revokeBlobURL();
  playBtn.textContent = "▶️";
  npPlayBtn.textContent = playBtn.textContent;
  // Clear subtitles
  const existingTracks = video.querySelectorAll('track');
  existingTracks.forEach(t => {
    if (t.src.startsWith('blob:')) URL.revokeObjectURL(t.src);
    t.remove();
  });
  subtitleBtn.textContent = '📝';
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
    // User cancelled the picker — do nothing
  }
};

// Subtitle loader
async function loadSubtitle(file) {
  const blob = file instanceof FileSystemFileHandle ? await file.getFile() : file;
  const url = URL.createObjectURL(blob);

  // Remove existing subtitles
  const existingTracks = video.querySelectorAll('track');
  existingTracks.forEach(t => {
    if (t.src.startsWith('blob:')) URL.revokeObjectURL(t.src);
    t.remove();
  });

  // Add new track
  const track = document.createElement('track');
  track.kind = 'subtitles';
  track.label = 'Loaded Subtitles';
  track.srclang = 'en';
  track.src = url;
  track.default = true;
  video.appendChild(track);

  // Enable the track
  const textTrack = video.textTracks[0];
  textTrack.mode = 'showing';

  // Update cue positions when track loads
  track.addEventListener('load', () => {
    if (!controls.classList.contains('hidden')) {
      updateSubtitlePosition(true);
    }
  });

  subtitleBtn.textContent = '✅';
}

subtitleBtn.onclick = async () => {
  // If subtitles already loaded, toggle them
  const tracks = video.textTracks;
  if (tracks.length > 0) {
    const track = tracks[0];
    if (track.mode === 'showing') {
      track.mode = 'hidden';
      subtitleBtn.textContent = '📝';
      return;
    } else {
      track.mode = 'showing';
      subtitleBtn.textContent = '✅';
      return;
    }
  }

  // No subtitles loaded yet - pick a file
  try {
    if (typeof window.showOpenFilePicker === "function") {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'Subtitle Files',
          accept: { 'text/vtt': ['.vtt', '.webvtt'] }
        }]
      });
      await loadSubtitle(handle);
    } else {
      const file = await pickFileSafariFallback(".vtt,.webvtt");
      if (file) await loadSubtitle(file);
    }
  } catch (err) {
    // User cancelled
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
  if (!hasActiveSource || Number.isNaN(duration))
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
    controls.classList.remove('hidden');
  } else {
    document.documentElement.requestFullscreen();
    controls.classList.add('hidden');
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
      closeActiveView();
    }
    return;
  }

  switch (e.code) {
    case "Enter":
    case "Space":
      togglePlayBtn();
      e.preventDefault(); // prevent scroll or default behavior
      break;

    case "ArrowRight":
      if (video.readyState >= 3 && hasActiveSource) {
        video.currentTime = Math.min(video.duration, video.currentTime + 5);
      }
      break;

    case "ArrowLeft":
      if (video.readyState >= 3 && hasActiveSource) {
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
    const hrs = Math.floor(seconds / 3600);
    const min = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const sec = Math.floor(seconds % 60).toString().padStart(2, "0");
    if (hrs > 0) {
      return `${hrs}:${min}:${sec}`;
    }
    return `${min}:${sec}`;
  }

  let hideTimeout;

// Adjust subtitle position to avoid overlap with controls
function updateSubtitlePosition(controlsVisible) {
  const tracks = video.textTracks;
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (track.kind === 'subtitles' || track.kind === 'captions') {
      for (let j = 0; j < track.cues.length; j++) {
        const cue = track.cues[j];
        if (controlsVisible) {
          // Calculate position relative to control bar
          const videoRect = video.getBoundingClientRect();
          const controlsRect = controls.getBoundingClientRect();

          // Position subtitle above the control bar with room for multi-line
          // gap includes space for potential 2-3 lines of subtitles
          const gap = 80; // extra gap for multi-line subtitles
          const subtitleBottom = videoRect.bottom - controlsRect.top + gap;
          const percentageFromTop = ((videoRect.height - subtitleBottom) / videoRect.height) * 100;

          cue.snapToLines = false;
          cue.line = Math.max(0, Math.min(100, percentageFromTop));
          cue.position = 50;
          cue.align = 'center';
        } else {
          // Reset to default bottom positioning
          cue.snapToLines = true;
          cue.line = 'auto';
        }
      }
    }
  }
}

function showControlsTemporarily() {
    // Show controls and cursor
    controls.classList.remove("hidden");
    playerWrapper.classList.remove("hide-cursor");
    updateSubtitlePosition(true);

    clearTimeout(hideTimeout);

    hideTimeout = setTimeout(() => {
      controls.classList.add("hidden");
      playerWrapper.classList.add("hide-cursor");
      updateSubtitlePosition(false);
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
      updateSubtitlePosition(true);
      clearTimeout(hideTimeout);
    }
    else
    {
      showControlsTemporarily();
    }
  });

  function expandCollapseBurgerMenu(hide) {
      if (hide) {
          configOptions.classList.add("hidden");
          advancedControls.classList.add("hidden");
      } else {
          configOptions.classList.remove("hidden");
          advancedControls.classList.remove("hidden");
      }
      localStorage.setItem("burgerMenuHidden", hide ? "true" : "false");
  }

  burgerBtn.addEventListener("click", () => {
      const currentlyHidden = configOptions.classList.contains("hidden");
      expandCollapseBurgerMenu(!currentlyHidden);
  });

  {
    expandCollapseBurgerMenu(localStorage.getItem("burgerMenuHidden") === "true");
  }

document.getElementById('storageBtn').addEventListener('click', () => {
  switchView("storageView");
});

document.getElementById('nowPlayingBtn').addEventListener('click', () => {
  switchView("nowPlayingView");
});

// Back button
document.getElementById("nowPlayingBackBtn").addEventListener("click", () => {
    closeActiveView();
});

// Store reconnect timer so we can cancel it if needed
let reconnectTimer = null;

// Triggered when the video element encounters a playback error
video.addEventListener("error", () => {
    console.warn("Stream error detected. Attempting to reconnect in 2 seconds...");

    // Clear any previous reconnect attempts
    clearTimeout(reconnectTimer);

    // Try reconnecting after a short delay
    reconnectTimer = setTimeout(() => {
        if (hasActiveSource && video.src && !video.srcObject) {
            const oldSrc = video.src;

            // Force the browser to reload the stream
            video.src = "";      // Reset source to force refresh
            video.load();        // Reload the video element
            video.src = oldSrc;  // Restore the original stream URL

            // Try playing again
            video.play().catch(() => {});
        }
    }, 2000);
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
