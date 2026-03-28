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
let currentMediaMetadata = null; // Store original metadata for subtitle updates

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
const fileWebRow = document.getElementById('fileWebRow');
const subtitleBtn = document.getElementById('subtitleBtn');

// Make timeDisplay clickable to seek to a specific time
let timeInputActive = false;
let npTimeInputActive = false;

if (timeDisplay) {
    timeDisplay.addEventListener('click', () => {
        // Only allow if playing and duration is not Infinity (not live stream)
        if (!hasActiveSource || !isFinite(video.duration) || video.duration <= 0) return;
        if (timeInputActive) return;

        timeInputActive = true;
        const originalText = timeDisplay.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalText.split(' / ')[0]; // Just the current time part
        input.style.cssText = 'width: 80px; font-size: 12px; padding: 2px 4px; border: 1px solid #666; border-radius: 4px; background: rgba(0,0,0,0.8); color: #fff; text-align: center;';
        input.placeholder = 'mm:ss';

        timeDisplay.textContent = '';
        timeDisplay.appendChild(input);
        input.focus();
        input.select();

        const finishEdit = () => {
            timeInputActive = false;
            timeDisplay.textContent = originalText;
        };

        input.addEventListener('blur', finishEdit);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                finishEdit();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const timeStr = input.value.trim();
                const seconds = parseTimeString(timeStr);
                if (seconds !== null && seconds >= 0 && seconds <= video.duration) {
                    video.currentTime = seconds;
                }
                finishEdit();
            }
        });
    });
}

// Make npTimeDisplay (Now Playing) also clickable to seek
if (npTimeDisplay) {
    npTimeDisplay.style.cursor = 'pointer';
    npTimeDisplay.addEventListener('click', () => {
        // Only allow if playing and duration is not Infinity (not live stream)
        if (!hasActiveSource || !isFinite(video.duration) || video.duration <= 0) return;
        if (npTimeInputActive) return;

        npTimeInputActive = true;
        const originalText = npTimeDisplay.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalText.split(' / ')[0]; // Just the current time part
        input.style.cssText = 'width: 80px; font-size: 12px; padding: 2px 4px; border: 1px solid #666; border-radius: 4px; background: rgba(0,0,0,0.8); color: #fff; text-align: center;';
        input.placeholder = 'mm:ss';

        npTimeDisplay.textContent = '';
        npTimeDisplay.appendChild(input);
        input.focus();
        input.select();

        const finishEdit = () => {
            npTimeInputActive = false;
            npTimeDisplay.textContent = originalText;
        };

        input.addEventListener('blur', finishEdit);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                finishEdit();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const timeStr = input.value.trim();
                const seconds = parseTimeString(timeStr);
                if (seconds !== null && seconds >= 0 && seconds <= video.duration) {
                    video.currentTime = seconds;
                }
                finishEdit();
            }
        });
    });
}

// Parse time string like "1:23:45" or "12:34" or "45" (seconds)
function parseTimeString(str) {
    if (!str) return null;

    // Try to parse as seconds only
    if (/^\d+(\.\d+)?$/.test(str)) {
        return parseFloat(str);
    }

    // Parse mm:ss or hh:mm:ss
    const parts = str.split(':').map(p => parseInt(p, 10));
    if (parts.some(isNaN)) return null;

    if (parts.length === 2) {
        const [mm, ss] = parts;
        if (ss < 0 || ss >= 60) return null;
        return mm * 60 + ss;
    } else if (parts.length === 3) {
        const [hh, mm, ss] = parts;
        if (mm < 0 || mm >= 60 || ss < 0 || ss >= 60) return null;
        return hh * 3600 + mm * 60 + ss;
    }

    return null;
}

// Clear all subtitles properly
function clearSubtitles() {
  // Disable and remove text tracks
  for (let i = 0; i != video.textTracks.length; ++i) {
    video.textTracks[i].mode = 'disabled';
  }
  // Remove track elements
  const existingTracks = video.querySelectorAll('track');
  existingTracks.forEach(t => {
    if (t.src.startsWith('blob:')) URL.revokeObjectURL(t.src);
    t.remove();
  });
  subtitleBtn.textContent = '📝';
  // Restore original metadata with transparent artwork
  if (currentMediaMetadata) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentMediaMetadata.title,
      artist: currentMediaMetadata.artist || '',
      album: currentMediaMetadata.album || ''
    });
  }
}

function updateTimeDisplay(txtct)
{
  if (!timeInputActive) {
    timeDisplay.textContent = txtct;
  }
  if (!npTimeInputActive) {
    npTimeDisplay.textContent = txtct;
  }
}

// Try to auto-load subtitle from storage path
async function tryAutoLoadSubtitleFromPath(entryPath) {
  if (!entryPath) return;

  // Check if auto-load is enabled
  if (typeof isAutoLoadSubtitleEnabled === 'function' && !isAutoLoadSubtitleEnabled()) {
    return;
  }

  // Only for storage paths
  if (!entryPath.startsWith('navigator_storage://') && !entryPath.startsWith('external_storage://')) {
    return;
  }

  // Get the path without extension
  const lastDot = entryPath.lastIndexOf('.');
  if (lastDot === -1) return;

  const basePath = entryPath.substring(0, lastDot);

  // Try .vtt
  const vttExtensions = ['.vtt'];

  for (const ext of vttExtensions) {
    const vttPath = basePath + ext;

    try {
      const vttHandle = await storage_resolvePath(vttPath);
      if (vttHandle && vttHandle instanceof FileSystemFileHandle) {
        const file = await vttHandle.getFile();
        await loadSubtitle(file);
        return; // Success, stop trying
      }
    } catch (err) {
      // Subtitle file doesn't exist - try next extension
    }
  }
}

async function play_source_internal(blobURL, mediametadata, sourceobject, playlist, autoPlay = true) {
  try {
    revokeBlobURL();
    currentBlobURL = blobURL;

    // Clear previous subtitles
    clearSubtitles();

    video.src = blobURL;
    hasActiveSource = true;
    hideControls();

    // 🔥 Fix: wait for metadata before playing
    video.onloadedmetadata = () => {
      if (autoPlay) {
        video.play().catch(err => console.warn("Play failed:", err));
      }
    };

    // Ensure video loads the new source
    video.load();

    playBtn.textContent = autoPlay ? "⏸️" : "▶️";

    // Store original metadata for subtitle updates
    currentMediaMetadata = { ...mediametadata };
    // Set MediaSession with transparent artwork
    navigator.mediaSession.metadata = new MediaMetadata({
      title: mediametadata.title,
      artist: mediametadata.artist || '',
      album: mediametadata.album || ''
    });
    document.title = `PWA Player ▶️ ${mediametadata.title}`;

    const entry = {
      name: mediametadata.title,
      artist: mediametadata.artist || "",
      path: playlist?.entryPath || blobURL
    };

    updateNowPlayingInfo(entry);

    // Try to auto-load subtitle for storage paths
    if (playlist?.entryPath) {
      tryAutoLoadSubtitleFromPath(playlist.entryPath);
    }

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

async function play_source_title(sourceobject, customTitle, playlist, autoPlay = true) {
  try {
    // Get metadata as usual
    const result = await getMediaMetadataFromSource(sourceobject);
    if (!result) return;

    const blobURL = result[1];
    const mediametadata = result[2];

    // Override the title
    mediametadata.title = customTitle;

    // Now call the internal playback handler
    await play_source_internal(blobURL, mediametadata, sourceobject, playlist, autoPlay);
  } catch (err) {
    console.warn(err);
  }
}

async function play_source(sourceobject, playlist, autoPlay = true) {
  try {
    const result = await getMediaMetadataFromSource(sourceobject);
    if (!result) return;

    const blobURL = result[1];
    const mediametadata = result[2];

    // Call the shared internal logic
    await play_source_internal(blobURL, mediametadata, sourceobject, playlist, autoPlay);

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

window.addEventListener("drop", async e => {
    container.style.outline = "none";

    // Check for directory drag (using DataTransferItem)
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
        for (const item of items) {
            if (item.kind === "file") {
                const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
                if (entry && entry.isDirectory) {
                    // It's a directory - add to external storage
                    try {
                        const dirHandle = await item.getAsFileSystemHandle();
                        if (dirHandle && dirHandle.kind === "directory") {
                            await addDirectoryToExternalStorage(dirHandle);
                        }
                    } catch (err) {
                        console.error("Failed to add directory:", err);
                        alert("Failed to add directory to external storage.");
                    }
                    return;
                }
            }
        }
    }

    // Fall back to file handling
    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (
        !file.type.startsWith("video/") &&
        !file.type.startsWith("audio/")
    ) {
        alert("Please drop a video, audio file, or directory");
        return;
    }

    play_source(file);
});

// Add directory to external storage (like Import External button)
async function addDirectoryToExternalStorage(dirHandle) {
    const ok = await verifyPermission(dirHandle);
    if (!ok) return;

    const name = dirHandle.name;

    // Load existing external dirs
    let dirs = await kv_get("external_dirs") || {};

    // Prevent overwriting an existing entry
    if (dirs[name]) {
        alert(`External directory "${name}" already exists.`);
        return;
    }

    // Save new entry
    dirs[name] = dirHandle;
    await kv_set("external_dirs", dirs);

    // Update in-memory cache
    window.externalStorageRoot = dirs;

    alert(`External directory "${name}" added.`);

    // Re-render storage if the function exists
    if (typeof renderStorage === 'function') {
        renderStorage();
    }
}

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
  currentMediaMetadata = null;
  playBtn.textContent = "▶️";
  npPlayBtn.textContent = playBtn.textContent;
  // Clear subtitles
  clearSubtitles();
  navigator.mediaSession.metadata = new MediaMetadata({});
  document.title = `PWA Player`;
  // Show controls when nothing is playing
  ensureControlsVisibility();
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

// Decode HTML entities in subtitle text (e.g., &gt; → >, &amp; → &)
function decodeHtmlEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

// Update MediaSession with current subtitle text
function updateMediaSessionSubtitle(subtitleText) {
  if (!currentMediaMetadata) return;

  // Check if subtitle in MediaSession is enabled
  if (typeof isSubtitleInMediaSessionEnabled === 'function' && !isSubtitleInMediaSessionEnabled()) {
    return;
  }

  if (subtitleText) {
    // Decode HTML entities and clean up the text
    let cleanText = decodeHtmlEntities(subtitleText);
    // Split into lines
    const lines = cleanText.split(/[\r\n]+/).filter(line => line.trim());

    // First line as title
    const firstLine = lines[0] ? lines[0].trim() : '';
    // Remaining lines as artist
    const remainingLines = lines.slice(1).join(' ').trim();

    const updatedMetadata = {
      title: firstLine,
      artist: remainingLines,
      album: currentMediaMetadata.album || ''
    };
    navigator.mediaSession.metadata = new MediaMetadata(updatedMetadata);
  } else {
    // No active subtitle - show empty title (VTT is loaded but no current cue)
    navigator.mediaSession.metadata = new MediaMetadata({
      title: '',
      artist: '',
      album: currentMediaMetadata.album || ''
    });
  }
}

// Set up cuechange listener for a text track
function setupSubtitleMediaSession(textTrack) {
  textTrack.addEventListener('cuechange', () => {
    if (textTrack.mode !== 'showing') return;

    const activeCues = textTrack.activeCues;
    if (activeCues && activeCues.length > 0) {
      const cue = activeCues[0];
      const subtitleText = cue.text || '';
      updateMediaSessionSubtitle(subtitleText);
    } else {
      updateMediaSessionSubtitle('');
    }
  });
}

// Subtitle loader
async function loadSubtitle(file) {
  const blob = file instanceof FileSystemFileHandle ? await file.getFile() : file;
  const url = URL.createObjectURL(blob);

  // Remove existing subtitles (keep button state since we're adding new ones)
  for (let i = 0; i != video.textTracks.length; ++i) {
    video.textTracks[i].mode = 'disabled';
  }
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

  // Set up MediaSession subtitle updates
  setupSubtitleMediaSession(textTrack);

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
      // Restore original metadata when hiding subtitles
      updateMediaSessionSubtitle('');
      return;
    } else {
      track.mode = 'showing';
      subtitleBtn.textContent = '✅';
      return;
    }
  }

  // No subtitles loaded yet - check if video is playing
  if (!hasActiveSource) {

    // Pick video first (without auto-play), then subtitle
    try {
      let videoFile;
      if (typeof window.showOpenFilePicker === "function") {
        const [handle] = await window.showOpenFilePicker({
          startIn: 'videos'
        });
        videoFile = handle;
      } else {
        videoFile = await pickFileSafariFallback("video/*");
      }

      // Now pick subtitle
      try {
        let subhd;
        if (typeof window.showOpenFilePicker === "function") {
          const [subHandle] = await window.showOpenFilePicker({
            types: [{
              description: 'Subtitle Files',
              accept: { 'text/vtt': ['.vtt'] }
            }]
          });
          await play_source(videoFile, null);
          await loadSubtitle(subHandle);
        } else {
          const subFile = await pickFileSafariFallback(".vtt");
          if (subFile)
          {
            await play_source(videoFile, null);
            await loadSubtitle(subFile);
          }
        }
      } catch (err) {
        // User cancelled subtitle picker - play video without subtitles
      }

    } catch (err) {
      // User cancelled video picker
    }
    return;
  }

  // Video is playing - pick subtitle file
  try {
    if (typeof window.showOpenFilePicker === "function") {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'Subtitle Files',
          accept: { 'text/vtt': ['.vtt'] }
        }]
      });
      await loadSubtitle(handle);
    } else {
      const file = await pickFileSafariFallback(".vtt");
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
    showControls(hasActiveSource);
  } else {
    document.documentElement.requestFullscreen();
    if (hasActiveSource) {
        hideControls();
    }
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
  for (let i = 0; i != tracks.length; ++i) {
    const track = tracks[i];
    if (track.kind === 'subtitles' || track.kind === 'captions') {
      for (let j = 0; j != track.cues.length; ++j) {
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

// Show controls and optionally start auto-hide timer
function showControls(autoHide = true) {
    controls.classList.remove("hidden");
    playerWrapper.classList.remove("hide-cursor");
    updateSubtitlePosition(true);

    clearTimeout(hideTimeout);

    // Auto-hide after 5 seconds only when playing
    if (autoHide && hasActiveSource) {
        hideTimeout = setTimeout(() => {
            controls.classList.add("hidden");
            playerWrapper.classList.add("hide-cursor");
            updateSubtitlePosition(false);
        }, 5000);
    }
}

// Hide controls immediately
function hideControls() {
    clearTimeout(hideTimeout);
    controls.classList.add("hidden");
    playerWrapper.classList.add("hide-cursor");
    updateSubtitlePosition(false);
}

// Ensure controls are visible when nothing is playing
function ensureControlsVisibility() {
    if (!hasActiveSource) {
        showControls(false); // Show without auto-hide
    }
}

// Click on player wrapper to toggle controls
playerWrapper.addEventListener("click", (e) => {
    const target = e.target;
    const controlsHidden = controls.classList.contains("hidden");

    if (controlsHidden) {
        // Show controls when clicking anywhere
        showControls(true);
    } else if (!controls.contains(target)) {
        // Clicking outside controls: hide if playing, otherwise do nothing
        if (hasActiveSource) {
            hideControls();
        }
    }
});

// Prevent clicks on controls from bubbling to playerWrapper
controls.addEventListener("click", (e) => {
    e.stopPropagation();
    // Reset auto-hide timer when interacting with controls
    if (hasActiveSource) {
        showControls(true);
    }
});

// Initial state: show controls (nothing playing)
ensureControlsVisibility();

  function expandCollapseBurgerMenu(hide) {
      if (hide) {
          if (configOptions) configOptions.classList.add("hidden");
          if (fileWebRow) fileWebRow.classList.add("hidden");
      } else {
          if (configOptions) configOptions.classList.remove("hidden");
          if (fileWebRow) fileWebRow.classList.remove("hidden");
      }
      localStorage.setItem("burgerMenuHidden", hide ? "true" : "false");
  }

  if (burgerBtn) {
    burgerBtn.addEventListener("click", () => {
        const currentlyHidden = configOptions && configOptions.classList.contains("hidden");
        expandCollapseBurgerMenu(!currentlyHidden);
    });
  }

  // Initialize from saved state (default to expanded/visible)
  const savedHidden = localStorage.getItem("burgerMenuHidden");
  if (savedHidden === null) {
    // Default: show the expanded rows
    expandCollapseBurgerMenu(false);
  } else {
    expandCollapseBurgerMenu(savedHidden === "true");
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
