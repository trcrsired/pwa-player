// ===============================
// Image Viewer Module
// ===============================

let imageElement = null;
let slideshowTimer = null;
let slideshowInterval = 5000; // Default 5 seconds
let currentImageEntry = null;
let isSlideshowActive = false;

// Scale levels: 1 (normal), 1.5 (enlarge), 2 (enlarge more), 3 (enlarge even more), 0.75 (smaller)
const SCALE_LEVELS = [1, 1.5, 2, 3, 0.75];
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

    // Mouse wheel for zooming
    imageElement.addEventListener('wheel', handleWheel, { passive: false });

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

    // Hook into stop button to stop slideshow
    const stopBtn = document.getElementById('stopBtn');
    const npStopBtn = document.getElementById('npStopBtn');

    if (stopBtn) {
        stopBtn.addEventListener('click', handleStopButtonClick);
    }
    if (npStopBtn) {
        npStopBtn.addEventListener('click', handleStopButtonClick);
    }

    // Hook into time display for image number input
    const timeDisplay = document.getElementById('timeDisplay');
    const npTimeDisplay = document.getElementById('npTimeDisplay');
    if (timeDisplay) {
        timeDisplay.addEventListener('click', handleTimeDisplayClick);
    }
    if (npTimeDisplay) {
        npTimeDisplay.addEventListener('click', handleNpTimeDisplayClick);
    }

    // Hook into progress bars for image switching
    const progressBar = document.getElementById('progressBar');
    const npProgressBar = document.getElementById('npProgressBar');
    if (progressBar) {
        progressBar.addEventListener('input', handleProgressBarInput);
        progressBar.addEventListener('change', handleProgressBarChange);
    }
    if (npProgressBar) {
        npProgressBar.addEventListener('input', handleNpProgressBarInput);
        npProgressBar.addEventListener('change', handleNpProgressBarChange);
    }
}

// Get current scale
function getCurrentScale() {
    return SCALE_LEVELS[currentScaleIndex];
}

// Handle mouse wheel for zooming in/out
function handleWheel(event) {
    if (!isImageViewerActive()) return;

    event.preventDefault();

    const delta = event.deltaY;

    if (delta < 0) {
        // Scroll up = zoom in
        zoomIn(event.clientX, event.clientY);
    } else {
        // Scroll down = zoom out
        zoomOut();
    }
}

// Zoom in one level
function zoomIn(clientX, clientY) {
    if (currentScaleIndex < SCALE_LEVELS.length - 1 && SCALE_LEVELS[currentScaleIndex + 1] > SCALE_LEVELS[currentScaleIndex]) {
        ++currentScaleIndex;

        if (clientX !== undefined && clientY !== undefined) {
            const rect = imageElement.getBoundingClientRect();
            const xPercent = ((clientX - rect.left) / rect.width) * 100;
            const yPercent = ((clientY - rect.top) / rect.height) * 100;
            imageElement.style.transformOrigin = `${xPercent}% ${yPercent}%`;
        }

        applyPanAndZoom();
        updateCursor();
        updateMagnifierButton();
    } else if (SCALE_LEVELS[currentScaleIndex] === 1) {
        for (let i = 0; i != SCALE_LEVELS.length; ++i) {
            if (SCALE_LEVELS[i] > 1) {
                currentScaleIndex = i;
                applyPanAndZoom();
                updateCursor();
                updateMagnifierButton();
                break;
            }
        }
    }
}

// Zoom out one level
function zoomOut() {
    if (currentScaleIndex > 0 && SCALE_LEVELS[currentScaleIndex - 1] < SCALE_LEVELS[currentScaleIndex]) {
        --currentScaleIndex;
        if (SCALE_LEVELS[currentScaleIndex] === 1) {
            panOffset = { x: 0, y: 0 };
            imageElement.style.transformOrigin = 'center center';
        }
        applyPanAndZoom();
        updateCursor();
        updateMagnifierButton();
    } else if (SCALE_LEVELS[currentScaleIndex] > 1) {
        for (let i = currentScaleIndex; i--;) {
            if (SCALE_LEVELS[i] < SCALE_LEVELS[currentScaleIndex]) {
                currentScaleIndex = i;
                if (SCALE_LEVELS[currentScaleIndex] === 1) {
                    panOffset = { x: 0, y: 0 };
                    imageElement.style.transformOrigin = 'center center';
                }
                applyPanAndZoom();
                updateCursor();
                updateMagnifierButton();
                break;
            }
        }
    }
}

// Update cursor based on scale
function updateCursor() {
    if (getCurrentScale() > 1) {
        imageElement.style.cursor = isPanning ? 'grabbing' : 'grab';
    } else {
        imageElement.style.cursor = 'default';
    }
}

// Handle image click for navigation (only at normal scale)
function handleImageClick(event) {
    if (getCurrentScale() !== 1) {
        const rect = imageElement.getBoundingClientRect();
        const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
        const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
        imageElement.style.transformOrigin = `${xPercent}% ${yPercent}%`;
        return;
    }

    const rect = imageElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const width = rect.width;

    if (x < width * 0.3) {
        if (typeof playPrevious === 'function') {
            playPrevious();
        }
    } else if (x > width * 0.7) {
        if (typeof playNext === 'function') {
            handleNextWithLoopCheck();
        }
    }
}

// Check if at last image and ask about looping
function handleNextWithLoopCheck() {
    const pos = getImageQueuePosition();
    if (!pos) {
        if (typeof playNext === 'function') playNext();
        return;
    }

    // If at last image (index === total)
    if (pos.index >= pos.total) {
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        const message = t('loopToFirstImage', 'You are at the last image. Jump back to the first one?');
        if (confirm(message)) {
            jumpToImageIndex(0);
        }
        return;
    }

    if (typeof playNext === 'function') {
        playNext();
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
    updateCursor();
}

// Apply pan offset and zoom
function applyPanAndZoom() {
    const scale = getCurrentScale();
    imageElement.style.transform = `scale(${scale}) translate(${panOffset.x}px, ${panOffset.y}px)`;
}

// Magnifier button click - cycle through scale levels
function handleMagnifierClick(event) {
    event.stopPropagation();

    currentScaleIndex = (currentScaleIndex + 1) % SCALE_LEVELS.length;
    const scale = SCALE_LEVELS[currentScaleIndex];

    if (scale === 1) {
        panOffset = { x: 0, y: 0 };
        imageElement.style.transformOrigin = 'center center';
        imageElement.style.transform = 'scale(1)';
    } else {
        applyPanAndZoom();
    }

    updateCursor();
    updateMagnifierButton();
}

// Update magnifier button based on current scale
function updateMagnifierButton() {
    const magnifierBtn = document.getElementById('magnifierBtn');
    if (!magnifierBtn) return;

    const scale = getCurrentScale();

    if (scale >= 2) {
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

        if (getCurrentScale() !== 1) {
            event.preventDefault();
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
    updateCursor();

    const touchDuration = Date.now() - touchStartTime;

    if (touchDuration < 200 && getCurrentScale() === 1) {
        const rect = imageElement.getBoundingClientRect();
        const x = lastTouchX - rect.left;
        const width = rect.width;

        if (x < width * 0.3) {
            if (typeof playPrevious === 'function') {
                playPrevious();
            }
        } else if (x > width * 0.7) {
            handleNextWithLoopCheck();
        }
    }
}

// Handle play button click for slideshow
function handlePlayButtonClick(event) {
    if (!isImageViewerActive()) return;

    event.stopPropagation();

    if (isSlideshowActive) {
        stopSlideshow();
    } else {
        startSlideshow();
    }

    updatePlayButtonForSlideshow();
}

// Handle stop button click - stop slideshow and clear image
function handleStopButtonClick(event) {
    if (!isImageViewerActive()) return;

    event.stopPropagation();

    stopSlideshow();
    hideImageViewer();

    if (typeof updateNowPlayingInfo === 'function') {
        updateNowPlayingInfo(null);
    }

    const timeDisplay = document.getElementById('timeDisplay');
    const npTimeDisplay = document.getElementById('npTimeDisplay');
    if (timeDisplay) timeDisplay.textContent = '00:00 / 00:00';
    if (npTimeDisplay) npTimeDisplay.textContent = '00:00 / 00:00';

    const progressBar = document.getElementById('progressBar');
    const npProgressBar = document.getElementById('npProgressBar');
    if (progressBar) {
        progressBar.value = 0;
        progressBar.max = 100;
        progressBar.step = 1;
    }
    if (npProgressBar) {
        npProgressBar.value = 0;
        npProgressBar.max = 100;
        npProgressBar.step = 1;
    }
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
    // Get interval from settings if not provided
    if (!intervalMs) {
        intervalMs = getSlideshowInterval();
    }
    slideshowInterval = intervalMs;

    stopSlideshow();
    isSlideshowActive = true;
    slideshowTimer = setInterval(() => {
        handleNextWithLoopCheck();
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

// Get slideshow interval from settings or default
function getSlideshowInterval() {
    // Try localStorage first
    const stored = localStorage.getItem('slideshowInterval');
    if (stored) {
        return parseInt(stored, 10) || 5000;
    }
    // Try settings input
    const input = document.getElementById('slideshowIntervalInput');
    if (input && input.value) {
        return parseInt(input.value, 10) || 5000;
    }
    return slideshowInterval;
}

// Handle time display click - allow typing image number
function handleTimeDisplayClick(event) {
    if (!isImageViewerActive()) return;
    showImageNumberInput('timeDisplay');
}

// Handle np time display click
function handleNpTimeDisplayClick(event) {
    if (!isImageViewerActive()) return;
    showImageNumberInput('npTimeDisplay');
}

// Show image number input in given display element
function showImageNumberInput(displayId) {
    const pos = getImageQueuePosition();
    if (!pos) return;

    const displayEl = document.getElementById(displayId);
    if (!displayEl) return;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = 1;
    input.max = pos.total;
    input.value = pos.index;
    input.style.cssText = 'width:60px;font-size:inherit;background:#333;color:#fff;border:1px solid #666;padding:2px;text-align:center;';

    displayEl.textContent = '';
    displayEl.appendChild(input);
    input.focus();

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const targetIndex = parseInt(input.value, 10) - 1;
            if (targetIndex >= 0 && targetIndex < pos.total) {
                jumpToImageIndex(targetIndex);
            }
            restoreDisplay();
        } else if (e.key === 'Escape') {
            restoreDisplay();
        }
    });

    input.addEventListener('blur', restoreDisplay);

    function restoreDisplay() {
        const newPos = getImageQueuePosition();
        if (newPos) {
            displayEl.textContent = `${newPos.index}/${newPos.total}`;
        }
    }
}

// Handle progress bar input (drag) - show preview
function handleProgressBarInput(event) {
    handleProgressBarInputGeneric('progressBar', 'timeDisplay');
}

// Handle np progress bar input
function handleNpProgressBarInput(event) {
    handleProgressBarInputGeneric('npProgressBar', 'npTimeDisplay');
}

// Generic progress bar input handler
function handleProgressBarInputGeneric(progressBarId, displayId) {
    if (!isImageViewerActive()) return;

    window.isDraggingProgressBar = true;

    const pos = getImageQueuePosition();
    if (!pos) return;

    const progressBar = document.getElementById(progressBarId);
    if (!progressBar) return;

    // Progress bar uses integer steps: 0 to total-1
    const targetIndex = parseInt(progressBar.value, 10);

    // Clamp to valid range
    const clampedIndex = Math.max(0, Math.min(targetIndex, pos.total - 1));

    const displayEl = document.getElementById(displayId);
    if (displayEl) {
        displayEl.textContent = `${clampedIndex + 1}/${pos.total}`;
    }
}

// Handle progress bar change (release) - jump to image
function handleProgressBarChange(event) {
    handleProgressBarChangeGeneric('progressBar');
}

// Handle np progress bar change
function handleNpProgressBarChange(event) {
    handleProgressBarChangeGeneric('npProgressBar');
}

// Generic progress bar change handler
function handleProgressBarChangeGeneric(progressBarId) {
    if (!isImageViewerActive()) return;

    window.isDraggingProgressBar = false;

    const pos = getImageQueuePosition();
    if (!pos) return;

    const progressBar = document.getElementById(progressBarId);
    if (!progressBar) return;

    const targetIndex = parseInt(progressBar.value, 10);
    const clampedIndex = Math.max(0, Math.min(targetIndex, pos.total - 1));

    jumpToImageIndex(clampedIndex);
}

// View image - main entry point
async function viewImage(sourceobject, entryPath) {
    const t = (key) => window.i18n ? window.i18n.t(key) : key;

    if (!imageElement) {
        initImageViewer();
    }

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

    if (imageElement) {
        imageElement.classList.remove('hidden');
    }

    const magnifierBtn = document.getElementById('magnifierBtn');
    if (magnifierBtn) {
        magnifierBtn.classList.remove('hidden');
        updateMagnifierButton();
    }

    let blobURL;
    let imageName = entryPath;

    try {
        if (sourceobject instanceof File || sourceobject instanceof Blob) {
            blobURL = URL.createObjectURL(sourceobject);
            imageName = sourceobject.name || entryPath;
        } else if (typeof sourceobject === 'string') {
            blobURL = sourceobject;
        } else if (sourceobject && typeof sourceobject.getFile === 'function') {
            const file = await sourceobject.getFile();
            blobURL = URL.createObjectURL(file);
            imageName = file.name || entryPath;
        } else {
            console.error('Unknown source object type:', sourceobject);
            alert(t('fileCannotBePlayed', 'This file type cannot be played directly.'));
            return false;
        }

        imageElement.src = blobURL;
        imageElement.alt = imageName;

        currentScaleIndex = 0;
        panOffset = { x: 0, y: 0 };
        imageElement.style.transform = 'scale(1)';
        imageElement.style.cursor = 'default';
        imageElement.style.transformOrigin = 'center center';

        currentImageEntry = {
            name: imageName,
            path: entryPath
        };

        if (typeof updateNowPlayingInfo === 'function') {
            updateNowPlayingInfo(currentImageEntry);
        }

        updatePlayButtonForSlideshow();
        updateMagnifierButton();
        updateImageTimeDisplay();
        updateImageProgressBars();

        return true;
    } catch (err) {
        console.error('Failed to view image:', err);
        alert(t('failedToPlay', 'Failed to display image.'));
        return false;
    }
}

// Hide image viewer and restore video
function hideImageViewer() {
    stopSlideshow();

    if (imageElement) {
        imageElement.classList.add('hidden');
        imageElement.src = '';
        currentScaleIndex = 0;
        panOffset = { x: 0, y: 0 };
        imageElement.style.transform = 'scale(1)';
    }

    const magnifierBtn = document.getElementById('magnifierBtn');
    if (magnifierBtn) {
        magnifierBtn.classList.add('hidden');
    }

    const playBtn = document.getElementById('playBtn');
    const npPlayBtn = document.getElementById('npPlayBtn');
    if (playBtn) playBtn.textContent = '▶️';
    if (npPlayBtn) npPlayBtn.textContent = '▶️';

    // Reset progress bars to video mode
    const progressBar = document.getElementById('progressBar');
    const npProgressBar = document.getElementById('npProgressBar');
    if (progressBar) {
        progressBar.value = 0;
        progressBar.max = 100;
        progressBar.step = 1;
    }
    if (npProgressBar) {
        npProgressBar.value = 0;
        npProgressBar.max = 100;
        npProgressBar.step = 1;
    }

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

    let queue = null;
    let currentIndex = -1;

    if (typeof getActiveQueue === 'function' && typeof nowPlayingIndex !== 'undefined') {
        queue = getActiveQueue();
        currentIndex = nowPlayingIndex;
    }

    if (!queue || queue.length === 0) return null;

    // Clamp index to valid range
    currentIndex = Math.max(0, Math.min(currentIndex, queue.length - 1));

    return {
        index: currentIndex + 1,  // 1-based for display
        total: queue.length
    };
}

// Update time display with queue position
function updateImageTimeDisplay() {
    if (!isImageViewerActive()) return;

    const pos = getImageQueuePosition();
    if (!pos) return;

    const timeDisplay = document.getElementById('timeDisplay');
    const npTimeDisplay = document.getElementById('npTimeDisplay');
    if (timeDisplay) timeDisplay.textContent = `${pos.index}/${pos.total}`;
    if (npTimeDisplay) npTimeDisplay.textContent = `${pos.index}/${pos.total}`;
}

// Update progress bars for image queue position (integer steps)
function updateImageProgressBars() {
    if (!isImageViewerActive()) return;

    const pos = getImageQueuePosition();
    if (!pos) return;

    const progressBar = document.getElementById('progressBar');
    const npProgressBar = document.getElementById('npProgressBar');

    // Set progress bar to use integer steps: 0 to total-1
    const max = pos.total - 1;
    const value = pos.index - 1;  // Convert 1-based to 0-based

    if (progressBar) {
        progressBar.min = 0;
        progressBar.max = max;
        progressBar.step = 1;
        progressBar.value = value;
    }
    if (npProgressBar) {
        npProgressBar.min = 0;
        npProgressBar.max = max;
        npProgressBar.step = 1;
        npProgressBar.value = value;
    }
}

// Jump to specific image index in queue
function jumpToImageIndex(targetIndex) {
    if (typeof nowPlaying_playIndex === 'function') {
        nowPlaying_playIndex(targetIndex);
    }
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
window.updateImageTimeDisplay = updateImageTimeDisplay;
window.updateImageProgressBars = updateImageProgressBars;
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.handleNextWithLoopCheck = handleNextWithLoopCheck;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initImageViewer);
} else {
    initImageViewer();
}