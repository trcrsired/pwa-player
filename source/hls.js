// HLS.js integration with lazy loading
// Only loads hls.js when needed for M3U8 streams

let hlsInstance = null;
let hlsLoadingPromise = null;
let hlsLoaded = false;

// CDN URL for hls.js (using minified version)
const HLS_JS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js";

// Check if browser supports native HLS (Safari)
function supportsNativeHLS() {
  const video = document.createElement('video');
  return video.canPlayType('application/vnd.apple.mpegurl') !== '' ||
         video.canPlayType('application/x-mpegURL') !== '';
}

// Check if URL is an M3U8 stream
function isM3U8Url(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return lower.includes('.m3u8') ||
         lower.includes('m3u8') ||
         lower.startsWith('application/vnd.apple.mpegurl') ||
         lower.startsWith('application/x-mpegURL');
}

// Lazy load hls.js library
async function loadHlsJs() {
  if (hlsLoaded && window.Hls) {
    return window.Hls;
  }

  if (hlsLoadingPromise) {
    return hlsLoadingPromise;
  }

  hlsLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = HLS_JS_CDN;
    script.async = true;

    script.onload = () => {
      hlsLoaded = true;
      hlsLoadingPromise = null;
      if (window.Hls && window.Hls.isSupported()) {
        resolve(window.Hls);
      } else {
        reject(new Error('HLS.js loaded but not supported'));
      }
    };

    script.onerror = () => {
      hlsLoadingPromise = null;
      reject(new Error('Failed to load HLS.js'));
    };

    document.head.appendChild(script);
  });

  return hlsLoadingPromise;
}

// Destroy current hls.js instance
function destroyHlsInstance() {
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
}

// Create hls.js instance and attach to video element
async function createHlsInstance(videoElement, url, corsBypassUrl) {
  // Destroy any existing instance first
  destroyHlsInstance();

  // Check if hls.js is supported
  if (!window.Hls || !window.Hls.isSupported()) {
    try {
      await loadHlsJs();
    } catch (err) {
      console.error('[HLS] Failed to load HLS.js:', err);
      return null;
    }
  }

  if (!window.Hls.isSupported()) {
    console.warn('[HLS] HLS.js not supported in this browser');
    return null;
  }

  try {
    const bypassBase = corsBypassUrl && corsBypassUrl.trim() ? corsBypassUrl.trim() : null;

    // Configure HLS.js with CORS bypass support using custom loader
    const hlsConfig = {
      enableWorker: !bypassBase, // Disable workers when using CORS bypass (workers can't use custom loaders easily)
      lowLatencyMode: false,
      backBufferLength: 90,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      startLevel: -1, // Auto start level
      capLevelToPlayerSize: true,
      abrEwmaDefaultEstimate: 500000, // 500kbps default estimate
    };

    // Apply CORS bypass using a custom loader wrapper
    if (bypassBase) {
      const DefaultLoader = window.Hls.DefaultConfig.loader;

      class CorsBypassLoader extends DefaultLoader {
        load(context, config, callbacks) {
          const url = context.url;
          // Apply CORS bypass only if:
          // 1. URL starts with http:// or https://
          // 2. URL doesn't already have bypass applied (check for bypass server domain)
          // 3. URL doesn't already have /http:// or /https:// pattern (indicates already bypassed)
          if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            // Check if already bypassed - URL contains bypassBase or has /http pattern
            const alreadyBypassed = url.includes('/http://') || url.includes('/https://') || url.startsWith(bypassBase);
            if (!alreadyBypassed) {
              context.url = bypassBase + url;
            }
          }
          super.load(context, config, callbacks);
        }
      }

      hlsConfig.loader = CorsBypassLoader;
    }

    hlsInstance = new window.Hls(hlsConfig);

    // Apply CORS bypass to the manifest URL
    let sourceUrl = url;
    if (bypassBase && url && (url.startsWith('http://') || url.startsWith('https://'))) {
      sourceUrl = bypassBase + url;
      console.log('[HLS] CORS bypass manifest URL:', sourceUrl);
    }

    hlsInstance.loadSource(sourceUrl);
    hlsInstance.attachMedia(videoElement);

    // Handle errors with recovery attempts
    hlsInstance.on(window.Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.warn('[HLS] Fatal error:', data.type, data.details);

        switch (data.type) {
          case window.Hls.ErrorTypes.NETWORK_ERROR:
            // Try to recover network error
            console.log('[HLS] Attempting network error recovery...');
            hlsInstance.startLoad();
            break;
          case window.Hls.ErrorTypes.MEDIA_ERROR:
            // Try to recover media error
            console.log('[HLS] Attempting media error recovery...');
            hlsInstance.recoverMediaError();
            break;
          default:
            // Cannot recover - destroy instance
            console.error('[HLS] Unrecoverable error, destroying instance');
            destroyHlsInstance();
            break;
        }
      }
    });

    return hlsInstance;
  } catch (err) {
    console.error('[HLS] Failed to create instance:', err);
    return null;
  }
}

// Play M3U8 URL using appropriate method (native or hls.js)
// Returns true if HLS playback was initiated, false otherwise
async function playHlsStream(videoElement, url, onReadyCallback, corsBypassUrl) {
  if (!isM3U8Url(url)) {
    return false;
  }

  // Check user preference: prefer hls.js over native HLS
  const preferHlsJs = typeof window.getPreferHlsJs === 'function' ? window.getPreferHlsJs() : true;

  // Use native HLS only if user prefers it AND browser supports it
  if (!preferHlsJs && supportsNativeHLS()) {
    console.log('[HLS] Using native HLS support (user preference)');
    // Apply CORS bypass for native HLS
    let videoSrc = url;
    if (corsBypassUrl && typeof corsBypassUrl === 'string' && corsBypassUrl.trim()) {
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        videoSrc = corsBypassUrl.trim() + url;
      }
    }
    videoElement.src = videoSrc;
    if (onReadyCallback) {
      videoElement.onloadedmetadata = onReadyCallback;
    }
    return true;
  }

  // For all other cases, use hls.js
  console.log('[HLS] Loading HLS.js for playback');

  try {
    const instance = await createHlsInstance(videoElement, url, corsBypassUrl);
    if (!instance) {
      // Fallback to native playback (might work in some cases)
      console.log('[HLS] HLS.js failed, trying native fallback');
      let videoSrc = url;
      if (corsBypassUrl && typeof corsBypassUrl === 'string' && corsBypassUrl.trim()) {
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          videoSrc = corsBypassUrl.trim() + url;
        }
      }
      videoElement.src = videoSrc;
      return false;
    }

    // Set up ready callback
    if (onReadyCallback) {
      instance.on(window.Hls.Events.MANIFEST_PARSED, () => {
        console.log('[HLS] Manifest parsed, starting playback');
        onReadyCallback();
      });
    }

    return true;
  } catch (err) {
    console.error('[HLS] Playback error:', err);
    // Fallback to native playback
    let videoSrc = url;
    if (corsBypassUrl && typeof corsBypassUrl === 'string' && corsBypassUrl.trim()) {
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        videoSrc = corsBypassUrl.trim() + url;
      }
    }
    videoElement.src = videoSrc;
    return false;
  }
}

// Check if HLS playback is active (hls.js instance exists)
function isHlsPlaybackActive() {
  return hlsInstance !== null;
}

// Get current hls.js instance (for external control if needed)
function getHlsInstance() {
  return hlsInstance;
}

// Export functions globally
window.isM3U8Url = isM3U8Url;
window.playHlsStream = playHlsStream;
window.destroyHlsInstance = destroyHlsInstance;
window.isHlsPlaybackActive = isHlsPlaybackActive;
window.getHlsInstance = getHlsInstance;
window.loadHlsJs = loadHlsJs;
window.supportsNativeHLS = supportsNativeHLS;
window.HLS_JS_CDN = HLS_JS_CDN;