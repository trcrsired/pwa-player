function getAllViews() {
  return Array.from(document.querySelectorAll(".overlay-view"));
}

function getActiveView() {
  return getAllViews().find(v => !v.classList.contains("hidden")) || null;
}

// Scroll position storage for each view (includes search state)
const viewScrollPositions = {};

// Get the scrollable content element for a view
function getScrollableElement(view) {
  if (!view) return null;
  // Priority: .list element, then .content element
  const listEl = view.querySelector(".list");
  if (listEl) return listEl;
  const contentEl = view.querySelector(".content");
  if (contentEl) return contentEl;
  return null;
}

// Get search input for a view (if applicable)
function getSearchInput(viewId) {
  if (viewId === "iptvView") return document.getElementById("iptvSearch");
  return null;
}

// Save scroll position for a view (includes search state)
function saveViewScrollPosition(view) {
  if (!view) return;
  const scrollEl = getScrollableElement(view);
  if (scrollEl) {
    const searchInput = getSearchInput(view.id);
    viewScrollPositions[view.id] = {
      scrollTop: scrollEl.scrollTop,
      searchValue: searchInput ? searchInput.value.trim() : ""
    };
  }
}

// Restore scroll position for a view (only if search state matches)
function restoreViewScrollPosition(viewId) {
  const view = document.getElementById(viewId);
  if (!view) return;
  const scrollEl = getScrollableElement(view);
  const saved = viewScrollPositions[viewId];
  if (scrollEl && saved !== undefined) {
    const searchInput = getSearchInput(viewId);
    const currentSearch = searchInput ? searchInput.value.trim() : "";
    // Only restore if search state matches what was saved
    if (saved.searchValue === currentSearch) {
      scrollEl.scrollTop = saved.scrollTop;
    }
  }
}

// Clear scroll position for a view (when content fundamentally changes)
function clearViewScrollPosition(viewId) {
  delete viewScrollPositions[viewId];
}

function switchView(viewId) {
  // Close any open context menu
  const openMenu = document.querySelector(".context-menu");
  if (openMenu) openMenu.remove();

  // Save scroll position of current view before switching
  const currentView = getActiveView();
  saveViewScrollPosition(currentView);

  const targetView = document.getElementById(viewId);
  targetView.classList.remove("hidden");
  document.getElementById("playerContainer").classList.add("hidden");
  history.pushState({ view: viewId }, "", location.href);

  // Note: Scroll restoration should be called by the view's render function after content is ready

  // Update subtitle position when view opens
  if (typeof controls !== 'undefined') {
    updateSubtitlePosition(false);
  }
}

function closeActiveView() {
  // Close any open context menu
  const openMenu = document.querySelector(".context-menu");
  if (openMenu) openMenu.remove();

  const view = getActiveView();
  if (view) {
    // Save scroll position before closing
    saveViewScrollPosition(view);

    view.classList.add("hidden");
    document.getElementById("playerContainer").classList.remove("hidden");
    // Only update history if we're not already navigating back
    if (history.state && history.state.view) {
      history.replaceState(null, "", location.href);
    }
    // Update subtitle position when view closes
    if (typeof controls !== 'undefined') {
      updateSubtitlePosition(!controls.classList.contains("hidden"));
    }
  }
}

// Handle back/forward gesture/button - navigate between views and main player
window.addEventListener("popstate", (e) => {
  // Close any open context menu
  const openMenu = document.querySelector(".context-menu");
  if (openMenu) openMenu.remove();

  const activeView = getActiveView();

  if (e.state && e.state.view) {
    // Forward navigation or restore view - open the view
    const viewId = e.state.view;
    const viewEl = document.getElementById(viewId);

    // Save scroll position of current view before switching
    saveViewScrollPosition(activeView);

    if (viewEl) {
      viewEl.classList.remove("hidden");
      document.getElementById("playerContainer").classList.add("hidden");

      // Restore scroll position for the target view
      restoreViewScrollPosition(viewId);

      // Update subtitle position when view opens
      if (typeof controls !== 'undefined') {
        updateSubtitlePosition(false);
      }
      // Trigger scroll button update if available
      if (typeof window.updateScrollButtons === 'function') {
        setTimeout(window.updateScrollButtons, 50);
        setTimeout(window.updateScrollButtons, 200);
      }
    }
  } else if (activeView) {
    // Back navigation from view - close it
    // Save scroll position before closing
    saveViewScrollPosition(activeView);

    activeView.classList.add("hidden");
    document.getElementById("playerContainer").classList.remove("hidden");
    // Update subtitle position when view closes
    if (typeof controls !== 'undefined') {
      updateSubtitlePosition(!controls.classList.contains("hidden"));
    }
    // Trigger scroll button hiding if available
    if (typeof window.updateScrollButtons === 'function') {
      window.updateScrollButtons();
    }
  }
  // If no active view and no state, let browser handle normally (exit app)
});

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

  // Handle temporary entries with file property (dropped files)
  if (sourceobject && sourceobject.file && (sourceobject.file instanceof File || sourceobject.file instanceof Blob)) {
    blobURL = URL.createObjectURL(sourceobject.file);
    mediasource.title = sourceobject.name || sourceobject.file.name;
  }
  // Handle temporary directory entries with handle property
  else if (sourceobject && sourceobject.handle && typeof sourceobject.handle.getFile === 'function') {
    const handle = sourceobject.handle;
    if (! await verifyPermission(handle)) return null;
    const file = await handle.getFile();
    blobURL = URL.createObjectURL(file);
    mediasource.title = sourceobject.name || file.name;
  } else if (sourceobject instanceof FileSystemFileHandle) {
    if (! await verifyPermission(sourceobject)) return null;

    const file = await sourceobject.getFile();
    blobURL = URL.createObjectURL(file);
    mediasource.title = file.name;
  } else if (sourceobject instanceof File || sourceobject instanceof Blob || sourceobject instanceof MediaSource) {
    blobURL = URL.createObjectURL(sourceobject);
    mediasource.title = sourceobject.name || null;
  } else if (typeof sourceobject === "string") {
    blobURL = sourceobject;
    try {
        // Use the URL constructor to parse the string safely
        const urlObj = new URL(sourceobject);
        // Get the last segment of the pathname
        const rawFileName = urlObj.pathname.split("/").pop();
        // Decode characters like %20, %E3... to human-readable text
        mediasource.title = rawFileName ? decodeURIComponent(rawFileName) : "Remote File";
    } catch (e) {
        // Fallback for strings that aren't valid full URLs
        const rawFileName = sourceobject.split("/").pop()?.split("?")[0] || "";
        mediasource.title = decodeURIComponent(rawFileName) || "Unknown";
    }
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

// Video status overlay elements
const videoStatusOverlay = document.getElementById("videoStatusOverlay");
const videoStatusIcon = document.getElementById("videoStatusIcon");
const videoStatusText = document.getElementById("videoStatusText");

function showVideoLoading() {
  if (!videoStatusOverlay) return;
  const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
  videoStatusIcon.className = "video-status-icon loading";
  videoStatusIcon.textContent = "";
  videoStatusText.textContent = t("videoLoading", "Loading...");
  videoStatusOverlay.classList.remove("hidden");
}

function showVideoError(message) {
  if (!videoStatusOverlay) return;
  videoStatusIcon.className = "video-status-icon error";
  videoStatusText.textContent = message;
  videoStatusOverlay.classList.remove("hidden");
}

function hideVideoStatus() {
  if (!videoStatusOverlay) return;
  videoStatusOverlay.classList.add("hidden");
}

function getFileExtension(filename) {
  if (!filename) return "";
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.substring(lastDot).toLowerCase();
}

function isLikelyUnsupportedVideo(filename) {
  const ext = getFileExtension(filename);
  // Check if it's not a webm video
  return ext && ext !== ".webm";
}

function getUnsupportedVideoMessage(filename) {
  const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

  if (isLikelyUnsupportedVideo(filename)) {
    return t("videoFormatNotSupported", `This video format may not be supported. .webm is the web standard format that works best across all platforms with no licensing fees. For example, Microsoft Edge on Android only supports .webm videos. Convert to .webm using tools such as FFmpeg, or try another browser such as Google Chrome.`);
  }
  return t("videoLoadFailed", "Failed to load video. The format may not be supported.");
}

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
const skipBackBtn = document.getElementById("skipBackBtn");
const skipForwardBtn = document.getElementById("skipForwardBtn");
const npSkipBackBtn = document.getElementById("npSkipBackBtn");
const npSkipForwardBtn = document.getElementById("npSkipForwardBtn");
const pickerBtn = document.getElementById("pickerBtn");
const volumeSlider = document.getElementById("volumeSlider");
const npVolumeSlider = document.getElementById("npVolumeSlider");
const timeDisplay = document.getElementById("timeDisplay");
const npTimeDisplay = document.getElementById("npTimeDisplay");
const progressBar = document.getElementById("progressBar");
const npProgressBar = document.getElementById("npProgressBar");
const progressContainer = document.getElementById("progressContainer");
const videoPreview = document.getElementById("videoPreview");
const previewVideo = document.getElementById("previewVideo");
const previewImage = document.getElementById("previewImage");
const previewTime = document.getElementById("previewTime");
const rotationBtn = document.getElementById("rotationBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const controls = document.getElementById("controls");
const volumeToggleBtn = document.getElementById("volumeToggle");

// Block context menu on all control buttons (prevents Edge long-press gesture menu)
controls.addEventListener('contextmenu', (e) => {
    if (e.target.tagName === 'BUTTON') {
        e.preventDefault();
    }
});

// Also block for Now Playing controls
const npControls = document.querySelector('.np-controls');
if (npControls) {
    npControls.addEventListener('contextmenu', (e) => {
        if (e.target.tagName === 'BUTTON') {
            e.preventDefault();
        }
    });
}
const npVolumeToggleBtn = document.getElementById("npVolumeToggle");
const burgerBtn = document.getElementById('burgerBtn');
const configOptions = document.getElementById('configOptions');
const fileWebRow = document.getElementById('fileWebRow');
const subtitleBtn = document.getElementById('subtitleBtn');

// Make timeDisplay clickable to seek to a specific time
let timeInputActive = false;
let npTimeInputActive = false;

function getActiveDuration() {
    if (typeof isEmbeddedPlayerActive === 'function' && isEmbeddedPlayerActive()) {
        if (typeof getEmbeddedDuration === 'function') {
            return getEmbeddedDuration();
        }
        return 0;
    }
    return video.duration;
}

function seekActivePlayerToTime(seconds) {
    if (typeof isEmbeddedPlayerActive === 'function' && isEmbeddedPlayerActive()) {
        if (typeof seekEmbeddedPlayerToTime === 'function') {
            seekEmbeddedPlayerToTime(seconds);
        }
    } else {
        video.currentTime = seconds;
    }
}

if (timeDisplay) {
    timeDisplay.style.cursor = 'pointer';
    timeDisplay.addEventListener('click', () => {
        // Check if embedded player or normal video is active
        const isEmbedded = typeof isEmbeddedPlayerActive === 'function' && isEmbeddedPlayerActive();
        const duration = getActiveDuration();

        // Only allow if something is playing and duration is valid
        if (!hasActiveSource && !isEmbedded) return;
        if (!isFinite(duration) || duration <= 0) return;
        if (timeInputActive) return;

        timeInputActive = true;
        window.timeInputActive = true; // Global flag for platforms
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
            window.timeInputActive = false;
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
                if (seconds !== null && seconds >= 0 && seconds <= duration) {
                    seekActivePlayerToTime(seconds);
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
        // Check if embedded player or normal video is active
        const isEmbedded = typeof isEmbeddedPlayerActive === 'function' && isEmbeddedPlayerActive();
        const duration = getActiveDuration();

        // Only allow if something is playing and duration is valid
        if (!hasActiveSource && !isEmbedded) return;
        if (!isFinite(duration) || duration <= 0) return;
        if (npTimeInputActive) return;

        npTimeInputActive = true;
        window.npTimeInputActive = true; // Global flag for platforms
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
            window.npTimeInputActive = false;
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
                if (seconds !== null && seconds >= 0 && seconds <= duration) {
                    seekActivePlayerToTime(seconds);
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
  // Check for screen recording (show elapsed time with 🖥️ icon)
  if (typeof window.getScreenRecordingElapsedTime === 'function') {
    const screenElapsed = window.getScreenRecordingElapsedTime();
    if (screenElapsed !== null) {
      const elapsedStr = window.formatRecordingTimeShort(screenElapsed);
      if (!timeInputActive) {
        timeDisplay.textContent = `🖥️ ${elapsedStr}`;
      }
      if (!npTimeInputActive) {
        npTimeDisplay.textContent = txtct; // npTimeDisplay shows normal time
      }
      return;
    }
  }

  // Check for image viewer (show queue position i/n)
  if (typeof window.isImageViewerActive === 'function' && window.isImageViewerActive()) {
    if (typeof window.updateImageTimeDisplay === 'function') {
      window.updateImageTimeDisplay();
    }
    if (typeof window.updateImageProgressBars === 'function') {
      window.updateImageProgressBars();
    }
    return;
  }

  // Check for video recording (append elapsed time with ⏺️ icon)
  let finalText = txtct;
  if (typeof window.getVideoRecordingElapsedTime === 'function') {
    const videoElapsed = window.getVideoRecordingElapsedTime();
    if (videoElapsed !== null) {
      const elapsedStr = window.formatRecordingTimeShort(videoElapsed);
      finalText = `${txtct} ⏺️ ${elapsedStr}`;
    }
  }

  if (!timeInputActive) {
    timeDisplay.textContent = finalText;
  }
  if (!npTimeInputActive) {
    npTimeDisplay.textContent = txtct; // npTimeDisplay shows normal time without recording indicator
  }
}

// Try to auto-load subtitle from storage path
async function tryAutoLoadSubtitleFromPath(entryPath) {
  if (!entryPath) return;

  // Check if auto-load is enabled
  if (typeof isAutoLoadSubtitleEnabled === 'function' && !isAutoLoadSubtitleEnabled()) {
    return;
  }

  // Get the path without extension
  const lastDot = entryPath.lastIndexOf('.');
  if (lastDot === -1) return;

  const basePath = entryPath.substring(0, lastDot);
// 1. Handle REMOTE_STORAGE (HTTP/HTTPS URLs)
  if (entryPath.startsWith('http://') || entryPath.startsWith('https://')) {
    const vttUrl = basePath + '.vtt';
    try {
      // Use a HEAD request to check if the .vtt file actually exists
      const response = await fetch(vttUrl, { method: 'HEAD', mode: "cors" });
      if (response.ok) {
        // If it exists, pass the URL directly to loadSubtitle
        // Note: loadSubtitle must be able to handle a string URL
        await loadSubtitle(vttUrl);
        return;
      }
    } catch (err) {
      console.warn("Remote subtitle auto-load failed (likely CORS or 404):", err);
    }
    return;
  }

  // Handle IndexedDB paths
  if (entryPath.startsWith('indexeddb://')) {
    // Parse the path: indexeddb://idb/folder/filename.ext
    const pathParts = entryPath.replace('indexeddb://idb/', '').split('/');
    if (pathParts.length < 1) return;

    const folder = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : pathParts[0];
    const filename = pathParts[pathParts.length - 1];
    const baseFilename = filename.substring(0, filename.lastIndexOf('.'));

    // Query IndexedDB for subtitle file in same folder
    try {
      const files = await window.idb_getFilesInFolder(folder);
      if (files) {
        for (const file of files) {
          if (file.name === baseFilename + '.vtt') {
            const vttFile = new File([file.blob], file.name, { type: file.type || 'text/vtt' });
            await loadSubtitle(vttFile);
            return; // Success
          }
        }
      }
    } catch (err) {
      // Subtitle not found in IndexedDB
    }
    return;
  }

  // Handle navigator_storage and external_storage paths
  if (!entryPath.startsWith('navigator_storage://') && !entryPath.startsWith('external_storage://')) {
    return;
  }

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

async function play_source_internal(blobURL, mediametadata, sourceobject, playlist, corsBypass = null) {
  // Check if this is an embedded URL (YouTube, Vimeo, etc.) - use embedded player instead
  if (typeof playEmbeddedUrl === 'function' && typeof isEmbeddedUrl === 'function' && isEmbeddedUrl(blobURL)) {
    // Use entry name from playlist if provided
    // For embedded URLs without entry name, use the full URL instead of extracted filename
    let entryName = playlist?.entryName;
    if (!entryName) {
        entryName = sourceobject; // Full URL
    }
    playEmbeddedUrl(blobURL, {
      playlist: playlist,
      entryName: entryName,
      title: mediametadata.title,
      sourceobject: sourceobject
    });
    return;
  }

  // Check if this is an image file - use image viewer instead
  const entryPath = playlist?.entryPath || mediametadata.title || '';
  if (typeof window.isImageFile === 'function' && window.isImageFile(entryPath)) {
    if (typeof window.viewImage === 'function') {
      window.viewImage(sourceobject, entryPath);
      return;
    }
  }

  // Hide image viewer if active (switching from image to video)
  if (typeof window.hideImageViewer === 'function') {
    window.hideImageViewer();
  }

  // Stop embedded player (YouTube/Vimeo) if active - we're switching to normal video
  if (typeof stopEmbeddedPlayer === 'function') {
    stopEmbeddedPlayer();
  }

  try {
    revokeBlobURL();
    currentBlobURL = blobURL;

    // Clear previous subtitles
    clearSubtitles();

    // Reset video position to start
    video.currentTime = 0;

    // Show loading indicator
    showVideoLoading();

    // Apply CORS bypass for network URLs
    let videoSrc = blobURL;
    const isNetworkUrl = typeof blobURL === 'string' && (blobURL.startsWith('http://') || blobURL.startsWith('https://'));
    if (isNetworkUrl && typeof applyCorsBypass === 'function') {
      videoSrc = applyCorsBypass(blobURL, corsBypass);
    }

    video.src = videoSrc;
    hasActiveSource = true;
    hideControls();

    // Store filename for error messages
    const filename = mediametadata.title;
    let retryCount = 0;
    let srcResetCount = 0; // Separate counter for src reset tracking
    const maxRetries = isNetworkUrl ? (typeof getNetworkRetryCount === 'function' ? getNetworkRetryCount() : 256) : 0;
    const retryDelay = typeof getRetryDelay === 'function' ? getRetryDelay() : 0;
    const retryBeforeSrcReset = typeof getRetryBeforeSrcReset === 'function' ? getRetryBeforeSrcReset() : 8;

    // Handle video errors with retry for network URLs
    video.onerror = (e) => {
      if (isNetworkUrl && retryCount < maxRetries) {
        ++retryCount;
        ++srcResetCount;
        const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
        const retryMsg = t('retryingLoad', 'Retrying ({count}/{max})...').replace('{count}', retryCount).replace('{max}', maxRetries);
        showVideoError(retryMsg);
        videoStatusOverlay.classList.remove("hidden");
        videoStatusIcon.className = "video-status-icon loading";
        setTimeout(() => {
          // Only reset src after configured number of retries
          if (retryBeforeSrcReset > 0 && srcResetCount >= retryBeforeSrcReset) {
            srcResetCount = 0; // Reset the counter
            const oldSrc = video.src;
            video.src = "";
            video.load();
            video.src = oldSrc;
          } else {
            video.load();
          }
        }, retryDelay);
        return;
      }
      hideVideoStatus();
      showVideoError(getUnsupportedVideoMessage(filename));
      hasActiveSource = false;
      clearVideoPreview();
    };

    // Hide loading when video starts playing
    video.oncanplay = () => {
      hideVideoStatus();
      retryCount = 0; // Reset retry count on successful load
    };

    // Handle stalled/waiting states
    video.onwaiting = () => {
      showVideoLoading();
    };

    video.onplaying = () => {
      hideVideoStatus();
      retryCount = 0; // Reset retry count on successful playback
    };

    // Wait for metadata before playing
    video.onloadedmetadata = () => {
      hideVideoStatus(); // Hide loading when metadata loads
      // Ensure video starts from beginning
      video.currentTime = 0;
      video.play().catch(err => console.warn("Play failed:", err));
      // Resize window to video dimensions if enabled
      if (typeof resizeWindowToVideo === 'function') {
        resizeWindowToVideo(video.videoWidth, video.videoHeight);
      }
    };

    // Ensure video loads the new source
    video.load();

    playBtn.textContent = "⏸️";
    npPlayBtn.textContent = playBtn.textContent;

    // Store original metadata for subtitle updates
    currentMediaMetadata = { ...mediametadata };
    // Set MediaSession - use entry name if available
    // For embedded URLs without entry name, use full URL instead of extracted filename
    let displayTitle;
    if (playlist?.entryName) {
        displayTitle = playlist.entryName;
    } else if (typeof isEmbeddedUrl === 'function' && isEmbeddedUrl(blobURL)) {
        displayTitle = sourceobject; // Full URL for embedded content without custom name
    } else {
        displayTitle = mediametadata.title;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: displayTitle,
      artist: mediametadata.artist || '',
      album: mediametadata.album || ''
    });
    document.title = `PWA Player ▶️ ${displayTitle}`;

    const entry = {
      name: displayTitle,
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
    hideVideoStatus();
    showVideoError(getUnsupportedVideoMessage(mediametadata?.title));
  }
}

async function play_source_title(sourceobject, customTitle, playlist, corsBypass = null) {
  try {
    // Get metadata as usual
    const result = await getMediaMetadataFromSource(sourceobject);
    if (!result) return;

    const blobURL = result[1];
    const mediametadata = result[2];

    // Override the title
    mediametadata.title = customTitle;

    // Now call the internal playback handler
    await play_source_internal(blobURL, mediametadata, sourceobject, playlist, corsBypass);
  } catch (err) {
    console.warn(err);
  }
}

async function play_source(sourceobject, playlist, corsBypass = null) {
  try {
    const result = await getMediaMetadataFromSource(sourceobject);
    if (!result) return;

    const blobURL = result[1];
    const mediametadata = result[2];

    // Call the shared internal logic
    await play_source_internal(blobURL, mediametadata, sourceobject, playlist, corsBypass);

  } catch (err) {
    console.warn(err);
  }
}

// Play IPTV channel with multiple URLs and fallback
// urls: array of URL strings
// title: channel name
// corsBypass: whether to use CORS bypass
async function play_iptv_with_fallback(urls, title, corsBypass = null) {
  if (!urls || urls.length === 0) return;

  const retryPerSource = typeof getIptvSourceRetryCount === 'function' ? getIptvSourceRetryCount() : 3;
  const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

  for (let i = 0; i != urls.length; ++i) {
    const url = urls[i];
    const attemptNum = i + 1;
    const totalSources = urls.length;

    // Show which source we're trying
    if (totalSources > 1) {
      showVideoLoading();
      videoStatusText.textContent = t('tryingSource', `Source ${attemptNum}/${totalSources}...`);
    }

    // Try this URL
    const success = await tryPlayUrl(url, title, corsBypass, retryPerSource, attemptNum, totalSources);

    if (success) {
      return; // Playing successfully
    }

    // Failed - try next source if available
    if (i < urls.length - 1) {
      console.log(`[IPTV] Source ${attemptNum} failed, trying next...`);
    }
  }

  // All sources failed
  showVideoError(t('allSourcesFailed', 'All sources failed'));
}

// Try to play a single URL with retry
// Returns true if successful, false if failed
function tryPlayUrl(url, title, corsBypass, maxRetries, sourceNum, totalSources) {
  return new Promise((resolve) => {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    revokeBlobURL();
    currentBlobURL = url;
    clearSubtitles();
    showVideoLoading();

    // Apply CORS bypass
    let videoSrc = url;
    const isNetworkUrl = typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
    if (isNetworkUrl && typeof applyCorsBypass === 'function') {
      videoSrc = applyCorsBypass(url, corsBypass);
    }

    video.src = videoSrc;
    hasActiveSource = true;
    hideControls();

    let retryCount = 0;
    let srcResetCount = 0; // Separate counter for src reset tracking
    let resolved = false;

    const retryDelay = typeof getRetryDelay === 'function' ? getRetryDelay() : 0;
    const retryBeforeSrcReset = typeof getRetryBeforeSrcReset === 'function' ? getRetryBeforeSrcReset() : 8;

    const cleanup = () => {
      video.onerror = null;
      video.oncanplay = null;
      video.onplaying = null;
      video.onloadedmetadata = null;
    };

    const fail = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      video.removeAttribute('src');
      video.load();
      resolve(false);
    };

    const succeed = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(true);
    };

    video.onerror = () => {
      if (retryCount < maxRetries) {
        ++retryCount;
        ++srcResetCount;
        const retryMsg = totalSources > 1
          ? t('retryingSource', `Source ${sourceNum}/${totalSources} - Retry ${retryCount}/${maxRetries}`)
          : t('retryingLoad', `Retrying (${retryCount}/${maxRetries})...`);
        showVideoError(retryMsg);
        setTimeout(() => {
          // Only reset src after configured number of retries
          if (retryBeforeSrcReset > 0 && srcResetCount >= retryBeforeSrcReset) {
            srcResetCount = 0; // Reset the counter
            const oldSrc = video.src;
            video.src = "";
            video.load();
            video.src = oldSrc;
          } else {
            video.load();
          }
        }, retryDelay);
      } else {
        fail();
      }
    };

    video.oncanplay = () => {
      hideVideoStatus();
      succeed();
    };

    video.onplaying = () => {
      hideVideoStatus();
      succeed();
    };

    video.onloadedmetadata = () => {
      hideVideoStatus();
      video.play().catch(err => console.warn("Play failed:", err));
      if (typeof resizeWindowToVideo === 'function') {
        resizeWindowToVideo(video.videoWidth, video.videoHeight);
      }
      succeed();
    };

    video.load();

    // Update UI
    playBtn.textContent = "⏸️";
    npPlayBtn.textContent = playBtn.textContent;
    currentMediaMetadata = { title };
    navigator.mediaSession.metadata = new MediaMetadata({ title });
    document.title = `PWA Player ▶️ ${title}`;

    updateNowPlayingInfo({ name: title, path: url });
  });
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
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
    container.style.outline = "none";

    // Check for directory drag (using DataTransferItem)
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
        for (const item of items) {
            if (item.kind === "file") {
                const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
                if (entry && entry.isDirectory) {
                    // It's a directory - check if we're in storage view
                    const storageView = document.getElementById('storageView');
                    const isInStorageView = storageView && !storageView.classList.contains('hidden');

                    try {
                        const dirHandle = await item.getAsFileSystemHandle();
                        if (dirHandle && dirHandle.kind === "directory") {
                            if (isInStorageView) {
                                // In storage view - add to external storage
                                await addDirectoryToExternalStorage(dirHandle);
                            } else {
                                // Not in storage view - play as temporary directory
                                await playTemporaryDirectory(dirHandle);
                            }
                        }
                    } catch (err) {
                        console.error("Failed to handle directory:", err);
                        alert(t('failedToImportExternal', "Failed to add directory to external storage."));
                    }
                    return;
                }
            }
        }
    }

    // Handle multiple files (images and media)
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        // Check if images are disabled from being added to playlist
        const imagesDisabled = typeof window.isImageToPlaylistDisabled === 'function' && window.isImageToPlaylistDisabled();

        // Check if all are images
        const imageFiles = Array.from(files).filter(f => window.isImageFile && window.isImageFile(f.name));
        const mediaFiles = Array.from(files).filter(f => f.type.startsWith("video/") || f.type.startsWith("audio/"));

        if (imageFiles.length > 0 && mediaFiles.length === 0) {
            // Only images
            if (imagesDisabled) {
                // Images disabled - just view the first image without adding to queue
                if (typeof window.viewImage === 'function') {
                    window.viewImage(imageFiles[0], imageFiles[0].name);
                }
            } else {
                // Add to now playing queue and play first (temporary entries)
                const queue = imageFiles.map(f => ({
                    name: f.name,
                    file: f, // File object from drop
                    isTemporary: true // Mark as temporary - cannot be saved to playlists
                }));
                if (typeof startNowPlayingFromPlaylistTable === 'function') {
                    startNowPlayingFromPlaylistTable(queue, 0, null, true);
                }
            }
            return;
        }

        if (mediaFiles.length > 0) {
            // Media files - play first
            play_source(mediaFiles[0]);
            return;
        }

        // Mixed files or unknown types - just play first
        if (files.length > 0) {
            play_source(files[0]);
        }
        return;
    }

    alert(t('dropMediaOrDirectory', "Please drop a video, audio file, image, or directory"));
});

// Play a temporary directory (not added to storage)
async function playTemporaryDirectory(dirHandle) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    // Verify permission first
    if (!await verifyPermission(dirHandle)) {
        alert(t('permissionDenied', 'Permission denied'));
        return;
    }

    // Check if images are disabled from being added to playlist
    const imagesDisabled = typeof window.isImageToPlaylistDisabled === 'function' && window.isImageToPlaylistDisabled();

    // Collect playable files from directory
    const files = [];
    for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === "file" && window.isPlayableOrImageFile && window.isPlayableOrImageFile(name)) {
            // Skip images if disabled
            if (imagesDisabled && window.isImageFile && window.isImageFile(name)) continue;
            files.push({ name, handle });
        }
    }

    if (files.length === 0) {
        alert(t('noPlayableFiles', 'No playable files found in folder'));
        return;
    }

    // Sort files by name
    files.sort((a, b) => a.name.localeCompare(b.name));

    // Create queue entries with file handles - these are temporary and NOT persistable
    const queue = files.map(f => ({
        name: f.name,
        handle: f.handle, // FileSystemFileHandle - used to get file on play
        dirHandle: dirHandle, // Keep directory handle for permission renewal
        isTemporary: true // Mark as temporary - should not be saved to playlists
    }));

    // Play from now playing
    if (typeof startNowPlayingFromPlaylistTable === 'function') {
        startNowPlayingFromPlaylistTable(queue, 0, null, true);
    }
}

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

    // Re-render storage if the function exists
    if (typeof renderStorage === 'function') {
        renderStorage();
    }
    if (confirm(`External directory "${name}" added.\nDo you want to play now`)) {
      addDirectoryToPlaylist(await loadExternalDirs(), "external_storage", "external", name, null);
    }
}

async function togglePlayBtn()
{
    // If embedded player (YouTube) is active → let embeddedplayer.js handle it
    if (typeof isEmbeddedPlayerActive === 'function' && isEmbeddedPlayerActive()) {
        return;
    }
    // If a video is already loaded and playable → toggle play/pause
    if (hasActiveSource && video.readyState >= 3 && !video.ended) {
        video.paused ? video.play() : video.pause();
        playBtn.textContent = video.paused ? "▶️" : "⏸️";
        npPlayBtn.textContent = playBtn.textContent;
        return;
    }
    // No active source or video ended → try to restore or play default playlist
    const restored = await restoreLastPlayback();
    if (restored) return;
    // Nothing to restore → open picker
    pickerBtn.click();
}

playBtn.onclick = togglePlayBtn;
npPlayBtn.onclick = togglePlayBtn;

// Clear video source when switching to embedded player (iframe)
function clearVideoSource() {
  video.pause();
  video.currentTime = 0;
  video.removeAttribute("src");
  video.load();
  hasActiveSource = false;
  clearVideoPreview();
  revokeBlobURL();
}
// Make it globally accessible for embedded player
window.clearVideoSource = clearVideoSource;

async function toggleStopBtn()
{
    video.pause();
    video.currentTime = 0;
    video.removeAttribute("src");
    video.load();
    hasActiveSource = false;
    clearVideoPreview();
    revokeBlobURL();
    currentMediaMetadata = null;
    playBtn.textContent = "▶️";
    npPlayBtn.textContent = playBtn.textContent;
    // Clear subtitles
    clearSubtitles();
    navigator.mediaSession.metadata = new MediaMetadata({});
    document.title = `PWA Player`;
    // Clear last played/playlist so default playlist can take over on next play
    kv_delete("lastplaylist").catch(() => {});
    kv_delete("lastplayed").catch(() => {});
    // Clear A-B loop
    if (typeof clearABLoop === 'function') clearABLoop();
    // Show controls when nothing is playing
    ensureControlsVisibility();
}

stopBtn.onclick = toggleStopBtn;
npStopBtn.onclick = toggleStopBtn;

// =====================================================
// Skip Back/Forward buttons with exponential long press support
// =====================================================
const LONG_PRESS_DELAY = 500; // ms before acceleration starts
const FAST_SKIP_INTERVAL = 100; // ms between visual updates

let skipIntervalId = null;
let skipDirection = 0;
let skipPressStartTime = 0;
window.pendingSeekTarget = null; // track where we want to seek to (global for settings.js)

function performSkip(direction, pressDuration = 0) {
    if (pressDuration < 0) pressDuration = 0;

    const duration = getActiveDuration();
    const currentTime = getActiveCurrentTime();
  
    let clampedTime;
    if (currentTime<=0 && direction < 0)
    {
      clampedTime = 0;
    }
    else if (duration<=currentTime && 0 < direction)
    {
      clampedTime = duration;
    }
    else
    {

      // Fixed skip parameters
      const skipShortBack = 2;        // backward only, 0–1s
      const skipMedium = 5;           // 1–3s
      const skipMid = 15;             // minimum after 3s
      const skipPercentMax = 2;       // max skip as percentage of video duration

      const t1 = 1000;                // 1 second
      const t2 = 3000;                // 3 seconds
      const accelEnd = 30000;         // 30 seconds

      const maxSkip = duration * (skipPercentMax / 100);

      let skipAmount;

      if (pressDuration <= t1) {
          // Phase 1: 0–1s
          skipAmount = direction < 0 ? skipShortBack : skipMedium;

      } else if (pressDuration <= t2) {
          // Phase 2: 1–3s → always 5s
          skipAmount = skipMedium;

      } else if (pressDuration >= accelEnd) {
          // Phase 4: cap at max skip
          skipAmount = maxSkip;

      } else {
          // Phase 3: logarithmic growth from 15 → maxSkip
          const t = (pressDuration - t2) / (accelEnd - t2); // normalized 0 → 1

          // Logarithmic smoothing (0 → 1)
          const smooth = Math.log(1 + 9 * t) / Math.log(10);

          skipAmount = skipMid + (maxSkip - skipMid) * smooth;

          if (skipAmount < skipMid) skipAmount = skipMid;
      }
      const newTime = currentTime + direction * skipAmount;
      clampedTime = Math.max(0, Math.min(newTime, duration || 0));

    }
    // Store pending seek target
    window.pendingSeekTarget = clampedTime;

    // Update time display immediately (visual feedback)
    updateTimeDisplay(`${formatTime(clampedTime)} / ${formatTime(duration)}`);

    // Update progress bar visually (without triggering seek)
    progressBar.max = duration;
    progressBar.value = clampedTime;
    npProgressBar.max = duration;
    npProgressBar.value = clampedTime;
}

function startSkip(direction) {
    skipDirection = direction;
    skipPressStartTime = Date.now();
    window.pendingSeekTarget = null;
    window.hasControlsPointerActivity = true;
    skippingTime = null;

    // Initial visual update (no seek)
    performSkip(direction, 0);

    // Start visual acceleration after LONG_PRESS_DELAY
    skipIntervalId = setTimeout(() => {

        skipIntervalId = setInterval(() => {
            // Effective long-press duration (time since acceleration started)
            const pressDuration = Date.now() - skipPressStartTime;
            performSkip(direction, pressDuration); // visual updates only
        }, FAST_SKIP_INTERVAL);

    }, LONG_PRESS_DELAY);
}

function stopSkip() {
    if (skipIntervalId) {
        clearTimeout(skipIntervalId);
        clearInterval(skipIntervalId);
        skipIntervalId = null;
    }
    // Perform final actual seek to pending target
    if (window.pendingSeekTarget !== null) {
        seekActivePlayerToTime(window.pendingSeekTarget);
        window.pendingSeekTarget = null;
    }
    skipDirection = 0;
    skipPressStartTime = 0;
    skippingTime = null;
    window.pendingSeekTarget = null;
    window.hasControlsPointerActivity = false;
}

function stopSkipPointer() {
    stopSkip();
    // Restart auto-hide timer after interaction ends
    if (hasActiveSource) {
        showControls(true);
    }
}

// Setup skip button event handlers using pointer events for VR compatibility
function setupSkipButton(btn, direction) {
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        startSkip(direction);
    });
    btn.addEventListener('pointerup', stopSkipPointer);
    btn.addEventListener('pointerleave', stopSkipPointer);
    btn.addEventListener('pointercancel', stopSkipPointer);
}

setupSkipButton(skipBackBtn, -1);
setupSkipButton(skipForwardBtn, 1);
setupSkipButton(npSkipBackBtn, -1);
setupSkipButton(npSkipForwardBtn, 1);

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
      // Use startIn: 'videos' as default, but allow all media types
      const [handle] = await window.showOpenFilePicker({
        startIn: 'videos',
        types: [
          {
            description: 'Video Files',
            accept: {
              'video/*': ['.mp4', '.webm', '.mkv', '.mov']
            }
          },
          {
            description: 'Audio Files',
            accept: {
              'audio/*': ['.mp3', '.wav', '.m4a', '.flac', '.ogg']
            }
          },
          {
            description: 'Image Files',
            accept: {
              'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif']
            }
          }
        ]
      });
      file = handle; // pass handle to your existing logic
    } else {
      // Safari / Firefox fallback - accept video, audio, and image
      file = await pickFileSafariFallback("video/*,audio/*,image/*");
    }

    // Check if it's an image file
    const fileName = file.name || (file.getFile ? (await file.getFile()).name : '');
    if (window.isImageFile && window.isImageFile(fileName)) {
      window.viewImage(file, fileName);
    } else {
      play_source(file).catch(nop);
    }
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

    // First line as title (use space if empty to prevent Android showing URL)
    const firstLine = lines[0] ? lines[0].trim() : ' ';
    // Remaining lines as artist (use space if empty to prevent Android showing URL)
    const remainingLines = lines.slice(1).join(' ').trim() || ' ';

    const updatedMetadata = {
      title: firstLine,
      artist: remainingLines,
      album: currentMediaMetadata.album || ''
    };
    navigator.mediaSession.metadata = new MediaMetadata(updatedMetadata);
  } else {
    // No active subtitle - show space to prevent Android showing URL
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ' ',
      artist: ' ',
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
  let url;
  let isBlob = false;

  // 1. Handle the different input types
  if (typeof file === 'string') {
    // Remote storage: it's already a URL
    url = file;
  } else if (file instanceof FileSystemFileHandle) {
    // Local storage (OPFS/External): get the File object, then create URL
    const fileObj = await file.getFile();
    url = URL.createObjectURL(fileObj);
    isBlob = true;
  } else if (file instanceof File || file instanceof Blob) {
    // Direct File/Blob object
    url = URL.createObjectURL(file);
    isBlob = true;
  } else {
    throw new Error("Unsupported subtitle file type");
  }

  // 2. Remove existing subtitles
  for (let i = 0; i < video.textTracks.length; ++i) {
    video.textTracks[i].mode = 'disabled';
  }
  
  const existingTracks = video.querySelectorAll('track');
  existingTracks.forEach(t => {
    // Only revoke if it was a local blob we created
    if (t.src.startsWith('blob:')) {
        URL.revokeObjectURL(t.src);
    }
    t.remove();
  });

  // 3. Add new track
  const track = document.createElement('track');
  track.kind = 'subtitles';
  track.label = 'Loaded Subtitles';
  track.srclang = 'en';
  track.src = url;
  track.default = true;
  
  // CORS Requirement: If it's a remote URL, the video element needs crossOrigin
  if (typeof file === 'string') {
    video.crossOrigin = "anonymous";
  }

  video.appendChild(track);

  // 4. Enable the track
  // Wait for the track to be added to the DOM properly
  track.onload = () => {
      const textTrack = Array.from(video.textTracks).find(t => t.label === 'Loaded Subtitles');
      if (textTrack) {
          textTrack.mode = 'showing';
          setupSubtitleMediaSession(textTrack);
      }
      
      if (!controls.classList.contains('hidden')) {
        updateSubtitlePosition(true);
      }
  };

  subtitleBtn.textContent = '✅';
}

// Expose loadSubtitle globally for storage.js to use
window.loadSubtitle = loadSubtitle;

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
  const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
  try {
    const url = prompt(t('enterWebURL', "Enter web URL:"));

    if (url)
    {
      // Check if it's a YouTube URL first
      if (typeof playEmbeddedUrl === 'function' && playEmbeddedUrl(url)) {
        return; // YouTube player created successfully
      }
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

// Track volume slider pointer activity to prevent auto-hide
volumeSlider.addEventListener("pointerdown", () => {
  window.hasControlsPointerActivity = true;
});
volumeSlider.addEventListener("pointerup", () => {
  window.hasControlsPointerActivity = false;
  if (hasActiveSource) showControls(true);
});
volumeSlider.addEventListener("pointercancel", () => {
  window.hasControlsPointerActivity = false;
});

npVolumeSlider.addEventListener("pointerdown", () => {
  window.hasControlsPointerActivity = true;
});
npVolumeSlider.addEventListener("pointerup", () => {
  window.hasControlsPointerActivity = false;
  if (hasActiveSource) showControls(true);
});
npVolumeSlider.addEventListener("pointercancel", () => {
  window.hasControlsPointerActivity = false;
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
  // Skip when embedded player is active - let embedded player handle progress
  if (typeof isEmbeddedPlayerActive === 'function' && isEmbeddedPlayerActive()) {
    return;
  }

  // Don't update display while we're showing skip preview
  if (window.pendingSeekTarget !== null) {
    return;
  }

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

  // Don't update progress bar value while user is dragging it
  if (!window.isDraggingProgressBar) {
    let todisplay;
    if (total) {
      todisplay = `${current} / ${total}`;
    } else {
      todisplay = current;
    }
    updateTimeDisplay(todisplay);
    progressBar.max = duration;
    progressBar.value = currentTime;
    npProgressBar.max = duration;
    npProgressBar.value = currentTime;
  }
});

function fullscreencallback()
{
  const embeddedActive = typeof isEmbeddedPlayerActive === 'function' && isEmbeddedPlayerActive();

  if (document.fullscreenElement) {
    document.exitFullscreen();
    if (!embeddedActive) {
        showControls(hasActiveSource);
    }
  } else {
    document.documentElement.requestFullscreen();
    // For embedded player, don't hide controls - fullscreen works same as non-fullscreen
    if (hasActiveSource && !embeddedActive) {
        hideControls();
    }
  }
}

fullscreenBtn.onclick = fullscreencallback;

// Progress bar input handler - updates time display during drag
function handleProgressBarInput(bar, timeDisplayEl) {
  const time = parseFloat(bar.value);
  if (isFinite(video.duration) && video.duration > 0) {
    const current = formatTime(time);
    const total = formatTime(video.duration);
    if (timeDisplayEl) {
      timeDisplayEl.textContent = `${current} / ${total}`;
    }
  }
}

progressBar.oninput = () => handleProgressBarInput(progressBar, timeDisplay);
progressBar.onchange = () => {
  video.currentTime = progressBar.value;
  window.isDraggingProgressBar = false;
  window.hasControlsPointerActivity = false;
  if (hasActiveSource) showControls(true);
};

npProgressBar.oninput = () => handleProgressBarInput(npProgressBar, npTimeDisplay);
npProgressBar.onchange = () => {
  video.currentTime = npProgressBar.value;
  window.isDraggingProgressBar = false;
  window.hasControlsPointerActivity = false;
  if (hasActiveSource) showControls(true);
};

// =====================================================
// Video/Image Preview on Progress Bar
// =====================================================
let previewLoadedSrc = null;
let previewLoadedImageQueue = null; // For image preview, store the queue

function formatPreviewTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function showVideoPreview(time, xPos) {
  // Skip if image viewer is active
  if (typeof window.isImageViewerActive === 'function' && window.isImageViewerActive()) {
    showImagePreview(time, xPos);
    return;
  }

  if (!videoPreview || !previewVideo || !hasActiveSource) return;
  if (!isFinite(video.duration) || video.duration === Infinity) return;
  // Check if video preview is enabled
  if (typeof isVideoPreviewEnabled === 'function' && !isVideoPreviewEnabled()) return;
  // Only show preview for videos (has width/height), not audio
  if (!video.videoWidth || !video.videoHeight || video.videoWidth === 0 || video.videoHeight === 0) return;

  // Hide image preview, show video preview
  if (previewImage) previewImage.style.display = "none";
  previewVideo.style.display = "block";

  // Set source if not already set
  if (previewLoadedSrc !== video.src) {
    previewVideo.src = video.src;
    previewLoadedSrc = video.src;
  }

  // Show preview
  videoPreview.style.display = "block";
  previewTime.textContent = formatPreviewTime(time);

  // Position preview
  const containerRect = progressContainer.getBoundingClientRect();
  const previewWidth = 160;
  let left = xPos - previewWidth / 2;
  left = Math.max(0, Math.min(left, containerRect.width - previewWidth));
  videoPreview.style.left = left + "px";

  // Seek preview video (already muted in HTML)
  previewVideo.currentTime = time;
}

// Image/Video preview when viewing items in queue
async function showImagePreview(index, xPos) {
  if (!videoPreview) return;

  // Get the queue
  const queue = typeof getActiveQueue === 'function' ? getActiveQueue() : null;
  if (!queue || queue.length === 0) return;

  // Get the target entry
  const targetIndex = Math.max(0, Math.min(Math.floor(index), queue.length - 1));
  const entry = queue[targetIndex];

  if (!entry) return;

  // Check if this entry is an image or video
  const entryName = entry.name || entry.path || '';
  const isImage = typeof window.isImageFile === 'function' && window.isImageFile(entryName);

  // For images, check if image preview is enabled (disabled by default due to performance)
  if (isImage && typeof window.isImagePreviewEnabled === 'function' && !window.isImagePreviewEnabled()) {
    // Just show the index number without loading the image
    videoPreview.style.display = "block";
    if (previewImage) previewImage.style.display = "none";
    if (previewVideo) previewVideo.style.display = "none";
    previewTime.textContent = `${targetIndex + 1}/${queue.length}`;
    const containerRect = progressContainer.getBoundingClientRect();
    const previewWidth = 160;
    let left = xPos - previewWidth / 2;
    left = Math.max(0, Math.min(left, containerRect.width - previewWidth));
    videoPreview.style.left = left + "px";
    return;
  }

  try {
    // Get blob URL for the entry
    let blobURL = null;
    let fileHandle = null;

    if (entry.handle && typeof entry.handle.getFile === 'function') {
      fileHandle = entry.handle;
      const file = await entry.handle.getFile();
      blobURL = URL.createObjectURL(file);
    } else if (entry.file && (entry.file instanceof File || entry.file instanceof Blob)) {
      blobURL = URL.createObjectURL(entry.file);
    } else if (entry.path && entry.path.startsWith('blob:')) {
      blobURL = entry.path;
    } else if (typeof storage_resolvePath === 'function' && entry.path) {
      const handle = await storage_resolvePath(entry.path);
      if (handle && typeof handle.getFile === 'function') {
        fileHandle = handle;
        const file = await handle.getFile();
        blobURL = URL.createObjectURL(file);
      }
    }

    if (!blobURL) return;

    if (isImage) {
      // Show image preview
      if (previewVideo) previewVideo.style.display = "none";
      if (previewImage) {
        previewImage.style.display = "block";
        if (previewLoadedImageQueue !== blobURL) {
          previewImage.src = blobURL;
          previewLoadedImageQueue = blobURL;
        }
      }
    } else {
      // Show video preview (for video files in queue)
      if (previewImage) previewImage.style.display = "none";
      if (previewVideo) {
        previewVideo.style.display = "block";
        if (previewLoadedSrc !== blobURL) {
          previewVideo.src = blobURL;
          previewLoadedSrc = blobURL;
          // Wait for video to be ready before seeking
          previewVideo.onloadedmetadata = () => {
            previewVideo.currentTime = 0;
          };
        } else {
          // Already loaded, just seek to beginning
          previewVideo.currentTime = 0;
        }
      }
    }

    // Show preview container
    videoPreview.style.display = "block";
    previewTime.textContent = `${targetIndex + 1}/${queue.length}`;

    // Position preview
    const containerRect = progressContainer.getBoundingClientRect();
    const previewWidth = 160;
    let left = xPos - previewWidth / 2;
    left = Math.max(0, Math.min(left, containerRect.width - previewWidth));
    videoPreview.style.left = left + "px";
  } catch (err) {
    console.warn('Failed to load preview:', err);
  }
}

function hideVideoPreview() {
  if (videoPreview) {
    videoPreview.style.display = "none";
  }
}

// Clear preview video/image resources
function clearVideoPreview() {
  if (previewVideo) {
    previewVideo.removeAttribute("src");
    previewVideo.load();
  }
  if (previewImage) {
    previewImage.removeAttribute("src");
  }
  previewLoadedSrc = null;
  previewLoadedImageQueue = null;
  hideVideoPreview();
}

// Track when user is actively dragging the progress bar (pointer down)
window.isDraggingProgressBar = false;
window.hasControlsPointerActivity = false;

// Common function to setup pointer events for a progress bar
function setupProgressBarPointerEvents(progressBarEl, containerEl) {
  if (!progressBarEl) return;

  const container = containerEl || progressBarEl.parentElement;

  // pointermove: show preview and update visual position
  container.addEventListener("pointermove", (e) => {
    // Check if image viewer is active - use image preview logic
    if (typeof window.isImageViewerActive === 'function' && window.isImageViewerActive()) {
      const pos = typeof window.getImageQueuePosition === 'function' ? window.getImageQueuePosition() : null;
      if (pos) {
        const rect = progressBarEl.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        const index = percent * (pos.total - 1);
        if (containerEl === progressContainer) {
          showImagePreview(index, x);
        }
      }
      return;
    }

    if (!hasActiveSource || !isFinite(video.duration)) return;

    // Show controls without auto-hide while hovering (only for main player)
    if (typeof showControls === 'function' && containerEl === progressContainer) {
      showControls(false);
    }

    const rect = progressBarEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const time = percent * video.duration;

    // Show video preview (only for main player progress bar)
    if (containerEl === progressContainer) {
      showVideoPreview(time, x);
    }
  });

  // pointerleave: hide preview
  container.addEventListener("pointerleave", () => {
    // Hide video preview (only for main player)
    if (containerEl === progressContainer) {
      hideVideoPreview();
    }
    // Restart auto-hide timer if playing (only for main player)
    if (containerEl === progressContainer && hasActiveSource && !video.paused) {
      showControls(true);
    }
  });

  // pointerdown: start dragging
  progressBarEl.addEventListener("pointerdown", (e) => {
    // Check if image viewer is active
    if (typeof window.isImageViewerActive === 'function' && window.isImageViewerActive()) {
      window.isDraggingProgressBar = true;
      window.hasControlsPointerActivity = true;
      return;
    }

    if (!hasActiveSource || !isFinite(video.duration)) return;

    window.isDraggingProgressBar = true;
    window.hasControlsPointerActivity = true;

    // Show controls without auto-hide while dragging (only for main player)
    if (typeof showControls === 'function' && containerEl === progressContainer) {
      showControls(false);
    }

    const rect = progressBarEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const time = percent * video.duration;

    // Show video preview (only for main player progress bar)
    if (containerEl === progressContainer) {
      showVideoPreview(time, x);
    }
  });

  // pointerup: end dragging
  progressBarEl.addEventListener("pointerup", () => {
    window.isDraggingProgressBar = false;
    window.hasControlsPointerActivity = false;
    // Restart auto-hide timer if playing (only for main player)
    if (containerEl === progressContainer && hasActiveSource && !video.paused) {
      showControls(true);
    }
  });

  // pointercancel: end dragging
  progressBarEl.addEventListener("pointercancel", () => {
    window.isDraggingProgressBar = false;
    window.hasControlsPointerActivity = false;
  });
}

// Setup pointer events for main player progress bar
if (progressContainer && progressBar) {
  setupProgressBarPointerEvents(progressBar, progressContainer);
}

// Setup pointer events for now playing progress bar
if (npProgressBar) {
  setupProgressBarPointerEvents(npProgressBar, null);
}

function showVideoTimeSeek(pendingSeekTarget,duration) {
  if (!videoStatusOverlay) return;
  const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
  videoStatusIcon.className = "";
  videoStatusIcon.textContent = "";
  let textcontent = pendingSeekTarget?formatPreviewTime(pendingSeekTarget):"";
  if(pendingSeekTarget && duration) {
    textcontent = `${textcontent} / ${formatPreviewTime(duration)}`;
  }
  videoStatusText.textContent = textcontent;
  videoStatusOverlay.classList.remove("hidden");
}

let isKeyDown = false;
let isArrowKeyDown = false;

document.addEventListener("keydown", (e) => {
  // First check for open context menu - close it on Escape
  if (!isKeyDown)
  {
    if (e.code === "Escape") {
      const openMenu = document.querySelector(".context-menu");
      if (openMenu) {
        openMenu.remove();
        e.preventDefault();
        isKeyDown = true;
        return;
      }
    }

    const activeView = getActiveView();

    if (activeView) {
      if (e.code === "Escape") {
        closeActiveView();
      }
      isKeyDown = true;
      return;
    }
  }

  switch (e.code) {
    case "Enter":
    case "Space":
      togglePlayBtn();
      e.preventDefault(); // prevent scroll or default behavior
      break;

    case "ArrowRight":
    case "ArrowLeft":
      if (video.readyState >= 3 && hasActiveSource) {
        if (!isArrowKeyDown)
        {
          isArrowKeyDown = (e.code=="ArrowLeft"?-1:1);
          startSkip(isArrowKeyDown);
        }
        showVideoTimeSeek(window.pendingSeekTarget, getActiveDuration());
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
  isKeyDown = true;
});

document.addEventListener("keyup", (e) => {
  isKeyDown = false;
  if(e.code == "ArrowRight" || e.code == "ArrowLeft")
  {
    if (isArrowKeyDown && video.readyState >= 3 && hasActiveSource) {
      stopSkip();
    }
    hideVideoStatus();
    isArrowKeyDown = 0;
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

  // If an overlay view is active, treat as controls not visible (bottom position)
  const activeView = getActiveView();
  if (activeView) {
    controlsVisible = false;
  }

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

    // Auto-hide after configured delay only when playing and no pointer activity in controls
    if (autoHide && hasActiveSource && !window.hasControlsPointerActivity) {
        const delay = parseInt(localStorage.getItem("controlsAutoHideDelay"), 10) || 10000;
        if (delay > 0) {
            hideTimeout = setTimeout(() => {
                // Check again before hiding - user might be interacting
                if (!window.hasControlsPointerActivity) {
                    controls.classList.add("hidden");
                    playerWrapper.classList.add("hide-cursor");
                    updateSubtitlePosition(false);
                }
            }, delay);
        }
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

    // If image viewer is active, handle image navigation zones using entire window
    if (typeof window.isImageViewerActive === 'function' && window.isImageViewerActive()) {
        const x = e.clientX;
        const y = e.clientY;
        // Use document.documentElement dimensions for better cross-platform compatibility
        const width = document.documentElement.clientWidth;
        const height = document.documentElement.clientHeight;

        // Bottom 20% = show controls
        if (y > height * 0.8) {
            if (typeof window.showImageControls === 'function') window.showImageControls();
            return;
        }

        // Left 30% = prev (hide controls)
        if (x < width * 0.3) {
            if (typeof window.hideImageControls === 'function') window.hideImageControls();
            if (typeof playPrevious === 'function') playPrevious();
            return;
        }

        // Right 30% = next (hide controls)
        if (x > width * 0.7) {
            if (typeof window.hideImageControls === 'function') window.hideImageControls();
            if (typeof window.handleNextWithLoopCheck === 'function') window.handleNextWithLoopCheck();
            return;
        }

        // Center = toggle controls
        if (controlsHidden) {
            if (typeof window.showImageControls === 'function') window.showImageControls();
        } else {
            if (typeof window.hideImageControls === 'function') window.hideImageControls();
        }
        return;
    }

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

// Triggered when the video element encounters a playback error during streaming
video.addEventListener("error", () => {
    const retryDelay = typeof getRetryDelay === 'function' ? getRetryDelay() : 0;

    // Clear any previous reconnect attempts
    clearTimeout(reconnectTimer);

    // Try reconnecting after configured delay
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
    }, retryDelay);
});

if ('launchQueue' in window) {
  launchQueue.setConsumer(async (launchParams) => {
    for (const fileHandle of launchParams.files) {
      const file = await fileHandle.getFile();
      // Check if it's an image file
      if (window.isImageFile && window.isImageFile(file.name)) {
        window.viewImage(file, file.name);
      } else {
        play_source(file);
      }
      return;
      // Route to appropriate player logic
    }
  });
}
