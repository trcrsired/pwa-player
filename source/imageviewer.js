// ===============================
// Image Viewer Module
// ===============================

let imageElement = null;
let slideshowTimer = null;
let slideshowInterval = 5000; // Default 5 seconds
let currentImageEntry = null;
let isSlideshowActive = false;

// Scale levels: 1 (normal), 1.5 (enlarge), 2 (enlarge more), 0.75 (smaller)
const SCALE_LEVELS = [1, 1.5, 2, 0.75];
let currentScaleIndex = 0;

// Pan state
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };
let lastPanOffset = { x: 0, y: 0 };

// Initialize image viewer
function initImageViewer() {
    imageElement = document.getElementById('imageDisplay');
    if (!imageElement) {
        console.warn('imageDisplay element not found');
        return;
    }

    // Click zone handler for navigation (only when not zoomed)
    imageElement.addEventListener('click', handleImageClick);

    // Mouse events for panning when zoomed
    imageElement.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Touch support for mobile
    imageElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    imageElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    imageElement.addEventListener('touchend', handleTouchEnd);

    // Magnifier button
    const magnifierBtn = document.getElementById('magnifierBtn');
    if (magnifierBtn) {
        magnifierBtn.addEventListener('click', handleMagnifierClick);
    }

    // Hook into play button for slideshow
    const playBtn = document.getElementById('playBtn');
    const npPlayBtn = document.getElementById('npPlayBtn');

    if (playBtn) {
        playBtn.addEventListener('click', handlePlayButtonClick);
    }
    if (npPlayBtn) {
        npPlayBtn.addEventListener('click', handlePlayButtonClick);
    }
}

// Get current scale
function getCurrentScale() {
    return SCALE_LEVELS[currentScaleIndex];
}

// Handle image click for navigation (only at normal scale)
function handleImageClick(event) {
    // If zoomed, don't navigate - allow panning instead
    if (getCurrentScale() !== 1) return;

    const rect = imageElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const width = rect.width;

    // Left 30% = prev, Right 30% = next
    if (x < width * 0.3) {
        if (typeof playPrevious === 'function') {
            playPrevious();
        }
    } else if (x > width * 0.7) {
        if (typeof playNext === 'function') {
            playNext();
        }
    }
}

// Mouse down - start panning when zoomed
function handleMouseDown(event) {
    if (getCurrentScale() === 1) return;

    event.preventDefault();
    isPanning = true;
    panStart = {
        x: event.clientX,
        y: event.clientY
    };
    lastPanOffset = { ...panOffset };
    imageElement.style.cursor = 'grabbing';
}

// Mouse move - pan the image
function handleMouseMove(event) {
    if (!isPanning) return;

    const scale = getCurrentScale();
    const deltaX = (event.clientX - panStart.x) / scale;
    const deltaY = (event.clientY - panStart.y) / scale;

    panOffset = {
        x: lastPanOffset.x + deltaX,
        y: lastPanOffset.y + deltaY
    };

    applyPanAndZoom();
}

// Mouse up - stop panning
function handleMouseUp(event) {
    if (!isPanning) return;

    isPanning = false;
    if (getCurrentScale() !== 1) {
        imageElement.style.cursor = 'grab';
    }
}

// Apply pan offset and zoom
function applyPanAndZoom() {
    const scale = getCurrentScale();
    imageElement.style.transform = `scale(${scale}) translate(${panOffset.x}px, ${panOffset.y}px)`;
    imageElement.style.transformOrigin = 'center center';
}

// Magnifier button click - cycle through scale levels
function handleMagnifierClick(event) {
    event.stopPropagation();

    // Cycle to next scale level
    currentScaleIndex = (currentScaleIndex + 1) % SCALE_LEVELS.length;
    const scale = SCALE_LEVELS[currentScaleIndex];

    // Reset pan when returning to normal scale
    if (scale === 1) {
        panOffset = { x: 0, y: 0 };
        imageElement.style.transform = 'scale(1)';
        imageElement.style.cursor = 'default';
    } else {
        applyPanAndZoom();
        imageElement.style.cursor = 'grab';
    }

    updateMagnifierButton();
}

// Update magnifier button based on current scale
function updateMagnifierButton() {
    const magnifierBtn = document.getElementById('magnifierBtn');
    if (!magnifierBtn) return;

    const nextScaleIndex = (currentScaleIndex + 1) % SCALE_LEVELS.length;
    const nextScale = SCALE_LEVELS[nextScaleIndex];

    if (nextScale > 1) {
        magnifierBtn.textContent = '🔍';
        magnifierBtn.title = window.i18n ? window.i18n.t('zoomIn') : 'Zoom In';
    } else if (nextScale < 1) {
        magnifierBtn.textContent = '🔎';
        magnifierBtn.title = window.i18n ? window.i18n.t('zoomOut') : 'Zoom Out';
    } else {
        magnifierBtn.textContent = '🔍';
        magnifierBtn.title = window.i18n ? window.i18n.t('zoomIn') : 'Zoom In';
    }
}

// Touch handlers for mobile
let touchStartTime = 0;
let lastTouchX = 0;
let lastTouchY = 0;

function handleTouchStart(event) {
    touchStartTime = Date.now();

    if (event.touches.length === 1) {
        lastTouchX = event.touches[0].clientX;
        lastTouchY = event.touches[0].clientY;

        // Start panning if zoomed
        if (getCurrentScale() !== 1) {
            isPanning = true;
            panStart = {
                x: lastTouchX,
                y: lastTouchY
            };
            lastPanOffset = { ...panOffset };
        }
    }
}

function handleTouchMove(event) {
    if (!isPanning || event.touches.length !== 1) return;

    event.preventDefault();

    const scale = getCurrentScale();
    const deltaX = (event.touches[0].clientX - panStart.x) / scale;
    const deltaY = (event.touches[0].clientY - panStart.y) / scale;

    panOffset = {
        x: lastPanOffset.x + deltaX,
        y: lastPanOffset.y + deltaY
    };

    applyPanAndZoom();
}

function handleTouchEnd(event) {
    isPanning = false;

    const touchDuration = Date.now() - touchStartTime;

    // Quick tap (< 200ms) at normal scale for navigation
    if (touchDuration < 200 && getCurrentScale() === 1) {
        const rect = imageElement.getBoundingClientRect();
        const x = lastTouchX - rect.left;
        const width = rect.width;

        if (x < width * 0.3) {
            if (typeof playPrevious === 'function') {
                playPrevious();
            }
        } else if (x > width * 0.7) {
            if (typeof playNext === 'function') {
                playNext();
            }
        }
    }
}

// Handle play button click for slideshow
function handlePlayButtonClick(event) {
    // Only handle if image viewer is active
    if (!isImageViewerActive()) return;

    // Prevent default video play/pause
    event.stopPropagation();

    // Toggle slideshow
    if (isSlideshowActive) {
        stopSlideshow();
    } else {
        startSlideshow();
    }

    updatePlayButtonForSlideshow();
}

// Update play button to show slideshow state
function updatePlayButtonForSlideshow() {
    if (!isImageViewerActive()) return;

    const playBtn = document.getElementById('playBtn');
    const npPlayBtn = document.getElementById('npPlayBtn');

    if (isSlideshowActive) {
        if (playBtn) playBtn.textContent = '⏸️';
        if (npPlayBtn) npPlayBtn.textContent = '⏸️';
    } else {
        if (playBtn) playBtn.textContent = '▶️';
        if (npPlayBtn) npPlayBtn.textContent = '▶️';
    }
}

// Slideshow controls
function startSlideshow(intervalMs = null) {
    if (intervalMs) slideshowInterval = intervalMs;

    stopSlideshow();
    isSlideshowActive = true;
    slideshowTimer = setInterval(() => {
        if (typeof playNext === 'function') {
            playNext();
        }
    }, slideshowInterval);

    updatePlayButtonForSlideshow();
}

function stopSlideshow() {
    if (slideshowTimer) {
        clearInterval(slideshowTimer);
        slideshowTimer = null;
    }
    isSlideshowActive = false;
    updatePlayButtonForSlideshow();
}

// Get slideshow interval from settings
function getSlideshowInterval() {
    const input = document.getElementById('slideshowIntervalInput');
    if (input && input.value) {
        return parseInt(input.value, 10) || 5000;
    }
    return slideshowInterval;
}

// View image - main entry point
async function viewImage(sourceobject, entryPath) {
    const t = (key) => window.i18n ? window.i18n.t(key) : key;

    // Initialize if needed
    if (!imageElement) {
        initImageViewer();
    }

    // Hide video and embedded player
    const video = document.getElementById('player');
    const embeddedPlayer = document.getElementById('embeddedPlayer');
    const videoStatusOverlay = document.getElementById('videoStatusOverlay');

    if (video) {
        video.classList.add('hidden');
        video.pause();
    }
    if (embeddedPlayer) {
        embeddedPlayer.classList.add('hidden');
    }
    if (videoStatusOverlay) {
        videoStatusOverlay.classList.add('hidden');
    }

    // Show image element
    if (imageElement) {
        imageElement.classList.remove('hidden');
    }

    // Show magnifier button
    const magnifierBtn = document.getElementById('magnifierBtn');
    if (magnifierBtn) {
        magnifierBtn.classList.remove('hidden');
        updateMagnifierButton();
    }

    // Get blob URL from source
    let blobURL;
    let imageName = entryPath;

    try {
        if (sourceobject instanceof File || sourceobject instanceof Blob) {
            blobURL = URL.createObjectURL(sourceobject);
            imageName = sourceobject.name || entryPath;
        } else if (typeof sourceobject === 'string') {
            // Direct URL
            blobURL = sourceobject;
        } else if (sourceobject && typeof sourceobject.getFile === 'function') {
            // FileSystemFileHandle
            const file = await sourceobject.getFile();
            blobURL = URL.createObjectURL(file);
            imageName = file.name || entryPath;
        } else {
            console.error('Unknown source object type:', sourceobject);
            alert(t('fileCannotBePlayed', 'This file type cannot be played directly.'));
            return false;
        }

        // Set image source
        imageElement.src = blobURL;
        imageElement.alt = imageName;

        // Reset scale and pan
        currentScaleIndex = 0;
        panOffset = { x: 0, y: 0 };
        imageElement.style.transform = 'scale(1)';
        imageElement.style.cursor = 'default';
        imageElement.style.transformOrigin = 'center center';

        // Store current entry
        currentImageEntry = {
            name: imageName,
            path: entryPath
        };

        // Update Now Playing info
        if (typeof updateNowPlayingInfo === 'function') {
            updateNowPlayingInfo(currentImageEntry);
        }

        // Update buttons
        updatePlayButtonForSlideshow();
        updateMagnifierButton();

        // Update time display with queue position
        if (typeof updateTimeDisplay === 'function') {
            updateTimeDisplay('');
        }

        return true;
    } catch (err) {
        console.error('Failed to view image:', err);
        alert(t('failedToPlay', 'Failed to display image.'));
        return false;
    }
}

// Hide image viewer and restore video
function hideImageViewer() {
    // Stop slideshow
    stopSlideshow();

    // Hide image element
    if (imageElement) {
        imageElement.classList.add('hidden');
        imageElement.src = '';
        currentScaleIndex = 0;
        panOffset = { x: 0, y: 0 };
        imageElement.style.transform = 'scale(1)';
    }

    // Hide magnifier button
    const magnifierBtn = document.getElementById('magnifierBtn');
    if (magnifierBtn) {
        magnifierBtn.classList.add('hidden');
    }

    // Reset play button
    const playBtn = document.getElementById('playBtn');
    const npPlayBtn = document.getElementById('npPlayBtn');
    if (playBtn) playBtn.textContent = '▶️';
    if (npPlayBtn) npPlayBtn.textContent = '▶️';

    // Reset progress bar
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        progressBar.value = 0;
    }

    // Show video
    const video = document.getElementById('player');
    if (video) {
        video.classList.remove('hidden');
    }

    currentImageEntry = null;
}

// Check if image viewer is active
function isImageViewerActive() {
    return imageElement && !imageElement.classList.contains('hidden');
}

// Get current image entry
function getCurrentImageEntry() {
    return currentImageEntry;
}

// Get current queue position (i/n) for image display
function getImageQueuePosition() {
    if (!isImageViewerActive() || !currentImageEntry) return null;

    // Get the queue from nowplaying.js
    let queue = null;
    let currentIndex = -1;

    // Try to get from nowplaying.js globals
    if (typeof getActiveQueue === 'function' && typeof nowPlayingIndex !== 'undefined') {
        queue = getActiveQueue();
        currentIndex = nowPlayingIndex;
    }

    if (!queue || queue.length === 0) return null;

    return {
        index: currentIndex + 1,
        total: queue.length
    };
}

// Update progress bar for image queue position
function updateImageProgressBar(index, total) {
    const progressBar = document.getElementById('progressBar');
    if (!progressBar) return;

    const percent = ((index - 1) / total) * 100;
    progressBar.value = percent;
    progressBar.max = 100;
}

// Expose functions globally
window.viewImage = viewImage;
window.hideImageViewer = hideImageViewer;
window.isImageViewerActive = isImageViewerActive;
window.startSlideshow = startSlideshow;
window.stopSlideshow = stopSlideshow;
window.getSlideshowInterval = getSlideshowInterval;
window.getCurrentImageEntry = getCurrentImageEntry;
window.getImageQueuePosition = getImageQueuePosition;
window.updateImageProgressBar = updateImageProgressBar;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initImageViewer);
} else {
    initImageViewer();
}