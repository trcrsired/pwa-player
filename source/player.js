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
const previewTime = document.getElementById("previewTime");
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

  // Get the path without extension
  const lastDot = entryPath.lastIndexOf('.');
  if (lastDot === -1) return;

  const basePath = entryPath.substring(0, lastDot);

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
    playEmbeddedUrl(blobURL);
    return;
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
      video.play().catch(err => console.warn("Play failed:", err));
      // Resize window to video dimensions if enabled
      if (typeof resizeWindowToVideo === 'function') {
        resizeWindowToVideo(video.videoWidth, video.videoHeight);
      }
    };

    // Ensure video loads the new source
    video.load();

    playBtn.textContent = "⏸️";

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
                    // It's a directory - add to external storage
                    try {
                        const dirHandle = await item.getAsFileSystemHandle();
                        if (dirHandle && dirHandle.kind === "directory") {
                            await addDirectoryToExternalStorage(dirHandle);
                        }
                    } catch (err) {
                        console.error("Failed to add directory:", err);
                        alert(t('failedToImportExternal', "Failed to add directory to external storage."));
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
        alert(t('dropMediaOrDirectory', "Please drop a video, audio file, or directory"));
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
    // If embedded player (YouTube) is active → let embeddedplayer.js handle it
    if (typeof isEmbeddedPlayerActive === 'function' && isEmbeddedPlayerActive()) {
        return;
    }
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

  // Don't update progress bar value while user is dragging it
  if (!isDraggingProgressBar) {
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
  isDraggingProgressBar = false;
};

npProgressBar.oninput = () => handleProgressBarInput(npProgressBar, npTimeDisplay);
npProgressBar.onchange = () => {
  video.currentTime = npProgressBar.value;
  isDraggingProgressBar = false;
};

// =====================================================
// Video Preview on Progress Bar
// =====================================================
let previewLoadedSrc = null;

function formatPreviewTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function showVideoPreview(time, xPos) {
  if (!videoPreview || !previewVideo || !hasActiveSource) return;
  if (!isFinite(video.duration) || video.duration === Infinity) return;
  // Check if video preview is enabled
  if (typeof isVideoPreviewEnabled === 'function' && !isVideoPreviewEnabled()) return;
  // Only show preview for videos (has width/height), not audio
  if (!video.videoWidth || !video.videoHeight || video.videoWidth === 0 || video.videoHeight === 0) return;

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

function hideVideoPreview() {
  if (videoPreview) {
    videoPreview.style.display = "none";
  }
}

// Clear preview video resources
function clearVideoPreview() {
  if (previewVideo) {
    previewVideo.removeAttribute("src");
    previewVideo.load();
  }
  previewLoadedSrc = null;
  hideVideoPreview();
}

// Track when user is actively dragging the progress bar (pointer down)
let isDraggingProgressBar = false;

// Progress bar preview events (using pointer events for cross-device support)
if (progressContainer && progressBar) {
  progressContainer.addEventListener("pointermove", (e) => {
    if (!hasActiveSource || !isFinite(video.duration)) return;

    showControls(false); // Show controls without auto-hide while hovering

    const rect = progressBar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const time = percent * video.duration;

    showVideoPreview(time, x);
  });

  progressContainer.addEventListener("pointerleave", () => {
    hideVideoPreview();
    // Restart auto-hide timer if playing
    if (hasActiveSource && !video.paused) {
        showControls(true);
    }
  });

  progressBar.addEventListener("pointerdown", (e) => {
    if (!hasActiveSource || !isFinite(video.duration)) return;

    isDraggingProgressBar = true;
    showControls(false); // Show controls without auto-hide while dragging

    const rect = progressBar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const time = percent * video.duration;

    showVideoPreview(time, x);
  });

  progressBar.addEventListener("pointerup", () => {
    isDraggingProgressBar = false;
    // Restart auto-hide timer if playing
    if (hasActiveSource && !video.paused) {
        showControls(true);
    }
  });

  progressBar.addEventListener("pointercancel", () => {
    isDraggingProgressBar = false;
  });
}

document.addEventListener("keydown", (e) => {
  // First check for open context menu - close it on Escape
  if (e.code === "Escape") {
    const openMenu = document.querySelector(".context-menu");
    if (openMenu) {
      openMenu.remove();
      e.preventDefault();
      return;
    }
  }

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

    // Auto-hide after configured delay only when playing and not dragging progress bar
    if (autoHide && hasActiveSource && !isDraggingProgressBar) {
        const delay = parseInt(localStorage.getItem("controlsAutoHideDelay"), 10) || 5000;
        if (delay > 0) {
            hideTimeout = setTimeout(() => {
                controls.classList.add("hidden");
                playerWrapper.classList.add("hide-cursor");
                updateSubtitlePosition(false);
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
      play_source(file);
      return;
      // Route to appropriate player logic
    }
  });
}
