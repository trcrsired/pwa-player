// ===============================
// Image Viewer Module
// ===============================

let imageElement = null;
let imageWrapper = null;
let slideshowTimer = null;
let slideshowInterval = 5000;
let currentImageEntry = null;
let isSlideshowActive = false;
let controlsHideTimer = null;
let isInteractingWithControls = false; // Flag to prevent hiding when using controls
let slideshowControlsVisible = false; // Track whether user wants controls visible during slideshow

// Scale levels for magnifier button cycling
const SCALE_LEVELS = [1, 1.5, 2, 3, 0.75];
let currentScaleIndex = 0;

// Add interaction flag handlers immediately with capture phase (fires BEFORE bubble phase)
document.getElementById("prevBtn")?.addEventListener("click", () => { isInteractingWithControls = true; }, true);
document.getElementById("nextBtn")?.addEventListener("click", () => { isInteractingWithControls = true; }, true);
document.getElementById("npPrevBtn")?.addEventListener("click", () => { isInteractingWithControls = true; }, true);
document.getElementById("npNextBtn")?.addEventListener("click", () => { isInteractingWithControls = true; }, true);

// Initialize
function initImageViewer() {
    imageElement = document.getElementById('imageDisplay');
    imageWrapper = document.getElementById('imageWrapper');
    if (!imageElement || !imageWrapper) return;

    // Wheel for zoom (mouse/trackpad)
    imageWrapper.addEventListener('wheel', handleWheel, { passive: false });

    // Keyboard navigation
    document.addEventListener('keydown', handleKeyDown);

    const magnifierBtn = document.getElementById('magnifierBtn');
    if (magnifierBtn) magnifierBtn.addEventListener('click', handleMagnifierClick);

    const playBtn = document.getElementById('playBtn');
    const npPlayBtn = document.getElementById('npPlayBtn');
    if (playBtn) playBtn.addEventListener('click', handlePlayButtonClick);
    if (npPlayBtn) npPlayBtn.addEventListener('click', handlePlayButtonClick);

    const stopBtn = document.getElementById('stopBtn');
    const npStopBtn = document.getElementById('npStopBtn');
    if (stopBtn) stopBtn.addEventListener('click', handleStopButtonClick);
    if (npStopBtn) npStopBtn.addEventListener('click', handleStopButtonClick);

    const timeDisplay = document.getElementById('timeDisplay');
    if (timeDisplay) {
        timeDisplay.addEventListener('click', () => {
            isInteractingWithControls = true;
            handleTimeDisplayClick(event);
        });
    }

    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        progressBar.addEventListener('input', () => { isInteractingWithControls = true; handleProgressBarInput(); });
        progressBar.addEventListener('change', handleProgressBarChange);
    }

    const controls = document.getElementById('controls');
    if (controls) {
        controls.addEventListener('mouseenter', cancelControlsHide);
        controls.addEventListener('mouseleave', scheduleControlsHide);
    }
}

function getControlsAutoHideDelay() {
    const input = document.getElementById('controlsAutoHideDelayInput');
    return input && input.value ? parseInt(input.value, 10) : 10000;
}

function scheduleControlsHide() {
    if (!isImageViewerActive()) return;
    cancelControlsHide();
    const delay = getControlsAutoHideDelay();
    if (delay > 0) {
        controlsHideTimer = setTimeout(hideImageControls, delay);
    }
}

function cancelControlsHide() {
    if (controlsHideTimer) {
        clearTimeout(controlsHideTimer);
        controlsHideTimer = null;
    }
}

function hideImageControls() {
    const controls = document.getElementById('controls');
    if (controls) controls.classList.add('hidden');
    slideshowControlsVisible = false; // User explicitly hid controls
}

function showImageControls() {
    const controls = document.getElementById('controls');
    if (controls) controls.classList.remove('hidden');
    slideshowControlsVisible = true; // User explicitly showed controls
    scheduleControlsHide();
}

function handleKeyDown(event) {
    if (!isImageViewerActive()) return;
    if (event.target.tagName === 'INPUT') return;

    if (event.key === 'ArrowLeft') {
        event.preventDefault();
        cancelControlsHide();
        hideImageControls();
        if (typeof playPrevious === 'function') playPrevious();
    } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        cancelControlsHide();
        hideImageControls();
        handleNextWithLoopCheck();
    } else if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        handlePlayButtonClick(event);
        // When toggling slideshow via spacebar, show controls so user can interact
        showImageControls();
    } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelControlsHide();
        hideImageControls();
    }
}

function getCurrentScale() {
    return SCALE_LEVELS[currentScaleIndex];
}

function handleWheel(event) {
    if (!isImageViewerActive()) return;
    event.preventDefault();
    if (event.deltaY < 0) zoomIn(event);
    else zoomOut();
}

function zoomIn(event) {
    const prevScale = getCurrentScale();

    if (currentScaleIndex < SCALE_LEVELS.length - 1 && SCALE_LEVELS[currentScaleIndex + 1] > SCALE_LEVELS[currentScaleIndex]) {
        ++currentScaleIndex;
    } else if (SCALE_LEVELS[currentScaleIndex] === 1) {
        for (let i = 0; i < SCALE_LEVELS.length; ++i) {
            if (SCALE_LEVELS[i] > 1) {
                currentScaleIndex = i;
                break;
            }
        }
    }

    if (prevScale !== getCurrentScale()) {
        applyScaleAndCenter(event);
        updateMagnifierButton();
    }
}

function zoomOut() {
    const prevScale = getCurrentScale();

    if (currentScaleIndex > 0 && SCALE_LEVELS[currentScaleIndex - 1] < SCALE_LEVELS[currentScaleIndex]) {
        --currentScaleIndex;
    } else if (SCALE_LEVELS[currentScaleIndex] > 1) {
        for (let i = currentScaleIndex; i--; ) {
            if (SCALE_LEVELS[i] < SCALE_LEVELS[currentScaleIndex]) {
                currentScaleIndex = i;
                break;
            }
        }
    }

    if (prevScale !== getCurrentScale()) {
        applyScaleAndCenter();
        updateMagnifierButton();
    }
}

// Apply scale by setting image size - native browser scroll handles panning
function applyScaleAndCenter(event) {
    const scale = getCurrentScale();
    const wrapperRect = imageWrapper.getBoundingClientRect();

    if (scale === 1) {
        // Fit to container
        imageElement.style.width = '';
        imageElement.style.height = '';
        imageElement.style.maxWidth = '100%';
        imageElement.style.maxHeight = '100%';
        imageWrapper.scrollTop = 0;
        imageWrapper.scrollLeft = 0;
    } else {
        // Set actual scaled size - browser scroll handles pan
        imageElement.style.maxWidth = '';
        imageElement.style.maxHeight = '';

        // Wait for image to load if not loaded
        if (imageElement.naturalWidth > 0) {
            const scaledWidth = imageElement.naturalWidth * scale;
            const scaledHeight = imageElement.naturalHeight * scale;
            imageElement.style.width = scaledWidth + 'px';
            imageElement.style.height = scaledHeight + 'px';

            // Center scroll position, or use event position for zoom point
            if (event && event.clientX !== undefined) {
                // Zoom toward the point where user scrolled
                const imgRect = imageElement.getBoundingClientRect();
                const xRatio = (event.clientX - imgRect.left) / (prevScaledWidth || scaledWidth);
                const yRatio = (event.clientY - imgRect.top) / (prevScaledHeight || scaledHeight);
                imageWrapper.scrollLeft = (scaledWidth - wrapperRect.width) * xRatio;
                imageWrapper.scrollTop = (scaledHeight - wrapperRect.height) * yRatio;
            } else {
                // Center the image
                imageWrapper.scrollLeft = (scaledWidth - wrapperRect.width) / 2;
                imageWrapper.scrollTop = (scaledHeight - wrapperRect.height) / 2;
            }
        }
    }
}

// Store previous scaled size for zoom focus calculation
let prevScaledWidth = 0;
let prevScaledHeight = 0;

function handleMagnifierClick(event) {
    event.stopPropagation();
    const prevScale = getCurrentScale();
    currentScaleIndex = (currentScaleIndex + 1) % SCALE_LEVELS.length;

    if (prevScale !== getCurrentScale()) {
        // Store previous size before applying new scale
        if (prevScale > 1 && imageElement.naturalWidth > 0) {
            prevScaledWidth = imageElement.naturalWidth * prevScale;
            prevScaledHeight = imageElement.naturalHeight * prevScale;
        }
        applyScaleAndCenter();
        updateMagnifierButton();
    }
}

function updateMagnifierButton() {
    const btn = document.getElementById('magnifierBtn');
    if (!btn) return;
    btn.textContent = getCurrentScale() >= 2 ? '🔎' : '🔍';
    btn.title = getCurrentScale() >= 2 ? 'Zoom Out' : 'Zoom In';
}

function handlePlayButtonClick(event) {
    if (!isImageViewerActive()) return;
    event.stopPropagation();
    isSlideshowActive ? stopSlideshow() : startSlideshow();
    updatePlayButtonForSlideshow();
    // Show controls when user interacts with play button during image viewing
    showImageControls();
}

function handleStopButtonClick(event) {
    if (!isImageViewerActive()) return;
    event.stopPropagation();
    stopSlideshow();
    hideImageViewer();
    if (typeof updateNowPlayingInfo === 'function') updateNowPlayingInfo(null);
    const td = document.getElementById('timeDisplay');
    if (td) td.textContent = '00:00 / 00:00';
    const pb = document.getElementById('progressBar');
    if (pb) pb.value = 0;
    // Show controls after stopping - user is back to normal video playback
    if (typeof showControls === 'function') showControls(false);
}

function updatePlayButtonForSlideshow() {
    if (!isImageViewerActive()) return;
    const playBtn = document.getElementById('playBtn');
    const npPlayBtn = document.getElementById('npPlayBtn');
    const text = isSlideshowActive ? '⏸️' : '▶️';
    if (playBtn) playBtn.textContent = text;
    if (npPlayBtn) npPlayBtn.textContent = text;
}

function startSlideshow(intervalMs = null) {
    slideshowInterval = intervalMs || getSlideshowInterval();
    stopSlideshow();
    isSlideshowActive = true;
    slideshowTimer = setInterval(handleNextWithLoopCheck, slideshowInterval);
    updatePlayButtonForSlideshow();
    // When starting slideshow, hide controls by default (user can show them via center click/spacebar)
    slideshowControlsVisible = false;
}

function stopSlideshow() {
    if (slideshowTimer) clearInterval(slideshowTimer);
    slideshowTimer = null;
    isSlideshowActive = false;
    slideshowControlsVisible = false; // Reset when slideshow stops
    updatePlayButtonForSlideshow();
}

function getSlideshowInterval() {
    const stored = localStorage.getItem('slideshowInterval');
    if (stored) return parseInt(stored, 10) || 5000;
    const input = document.getElementById('slideshowIntervalInput');
    return input && input.value ? parseInt(input.value, 10) : slideshowInterval;
}

function handleTimeDisplayClick(event) {
    if (!isImageViewerActive()) return;
    event.stopPropagation();
    const pos = getImageQueuePosition();
    if (!pos) return;
    const td = document.getElementById('timeDisplay');
    if (!td) return;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = 1;
    input.max = pos.total;
    input.value = pos.index;
    input.style.cssText = 'width:60px;font-size:inherit;background:#333;color:#fff;border:1px solid #666;padding:2px;text-align:center;';
    td.textContent = '';
    td.appendChild(input);
    input.focus();

    function restore() {
        const newPos = getImageQueuePosition();
        if (newPos) td.textContent = `${newPos.index}/${newPos.total}`;
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const idx = parseInt(input.value, 10) - 1;
            if (idx >= 0 && idx < pos.total) jumpToImageIndex(idx);
            restore();
        } else if (e.key === 'Escape') restore();
    });
    input.addEventListener('blur', restore);
}

function handleProgressBarInput() {
    if (!isImageViewerActive()) return;
    window.isDraggingProgressBar = true;
    const pos = getImageQueuePosition();
    if (!pos) return;
    const pb = document.getElementById('progressBar');
    if (!pb) return;
    const idx = parseInt(pb.value, 10);
    const clamped = Math.max(0, Math.min(idx, pos.total - 1));
    const td = document.getElementById('timeDisplay');
    if (td) td.textContent = `${clamped + 1}/${pos.total}`;
}

function handleProgressBarChange() {
    if (!isImageViewerActive()) return;
    window.isDraggingProgressBar = false;
    const pos = getImageQueuePosition();
    if (!pos) return;
    const pb = document.getElementById('progressBar');
    if (!pb) return;
    const idx = parseInt(pb.value, 10);
    jumpToImageIndex(Math.max(0, Math.min(idx, pos.total - 1)));
}

function handleNextWithLoopCheck() {
    const pos = getImageQueuePosition();
    if (!pos) {
        if (typeof playNext === 'function') playNext();
        return;
    }
    if (pos.index >= pos.total) {
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        if (confirm(t('loopToFirstImage', 'Jump back to first image?'))) {
            jumpToImageIndex(0);
        }
        return;
    }
    if (typeof playNext === 'function') playNext();
}

async function viewImage(sourceobject, entryPath) {
    if (!imageElement) initImageViewer();

    const video = document.getElementById('player');
    const embedded = document.getElementById('embeddedPlayer');
    const overlay = document.getElementById('videoStatusOverlay');

    if (video) { video.classList.add('hidden'); video.pause(); }
    if (embedded) embedded.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');

    imageWrapper.classList.remove('hidden');

    const magBtn = document.getElementById('magnifierBtn');
    if (magBtn) { magBtn.classList.remove('hidden'); updateMagnifierButton(); }

    // Handle controls visibility based on context
    if (isSlideshowActive) {
        if (slideshowControlsVisible) {
            const controls = document.getElementById('controls');
            if (controls) controls.classList.remove('hidden');
            scheduleControlsHide();
        } else {
            cancelControlsHide();
            const controls = document.getElementById('controls');
            if (controls) controls.classList.add('hidden');
        }
    } else if (isInteractingWithControls) {
        isInteractingWithControls = false;
        showImageControls();
    } else {
        cancelControlsHide();
        hideImageControls();
    }

    let blobURL, imageName = entryPath;

    try {
        // Handle temporary entries with file property (dropped files)
        if (sourceobject && sourceobject.file && (sourceobject.file instanceof File || sourceobject.file instanceof Blob)) {
            blobURL = URL.createObjectURL(sourceobject.file);
            imageName = sourceobject.name || sourceobject.file.name || entryPath;
        }
        // Handle temporary directory entries with handle property
        else if (sourceobject && sourceobject.handle && typeof sourceobject.handle.getFile === 'function') {
            const file = await sourceobject.handle.getFile();
            blobURL = URL.createObjectURL(file);
            imageName = sourceobject.name || file.name || entryPath;
        }
        else if (sourceobject instanceof File || sourceobject instanceof Blob) {
            blobURL = URL.createObjectURL(sourceobject);
            imageName = sourceobject.name || entryPath;
        } else if (typeof sourceobject === 'string') {
            blobURL = sourceobject;
        } else if (sourceobject && typeof sourceobject.getFile === 'function') {
            const file = await sourceobject.getFile();
            blobURL = URL.createObjectURL(file);
            imageName = file.name || entryPath;
        } else {
            alert('This file type cannot be played directly.');
            return false;
        }

        imageElement.src = blobURL;
        imageElement.alt = imageName;

        currentScaleIndex = 0;
        prevScaledWidth = 0;
        prevScaledHeight = 0;
        imageElement.style.width = '';
        imageElement.style.height = '';
        imageElement.style.maxWidth = '100%';
        imageElement.style.maxHeight = '100%';
        imageWrapper.scrollTop = 0;
        imageWrapper.scrollLeft = 0;

        currentImageEntry = { name: imageName, path: entryPath };

        if (typeof updateNowPlayingInfo === 'function') updateNowPlayingInfo(currentImageEntry);
        updatePlayButtonForSlideshow();
        updateMagnifierButton();
        updateImageTimeDisplay();
        updateImageProgressBars();

        return true;
    } catch (err) {
        console.error('Failed to view image:', err);
        alert('Failed to display image.');
        isInteractingWithControls = false;
        return false;
    }
}

function hideImageViewer() {
    stopSlideshow();
    cancelControlsHide();
    isInteractingWithControls = false;

    if (imageWrapper) {
        imageWrapper.classList.add('hidden');
    }
    if (imageElement) {
        imageElement.src = '';
        currentScaleIndex = 0;
        prevScaledWidth = 0;
        prevScaledHeight = 0;
        imageElement.style.width = '';
        imageElement.style.height = '';
        imageElement.style.maxWidth = '100%';
        imageElement.style.maxHeight = '100%';
    }

    const magBtn = document.getElementById('magnifierBtn');
    if (magBtn) magBtn.classList.add('hidden');

    const playBtn = document.getElementById('playBtn');
    const npPlayBtn = document.getElementById('npPlayBtn');
    if (playBtn) playBtn.textContent = '▶️';
    if (npPlayBtn) npPlayBtn.textContent = '▶️';

    const controls = document.getElementById('controls');
    if (controls) controls.classList.remove('hidden');

    const pb = document.getElementById('progressBar');
    if (pb) { pb.value = 0; pb.max = 100; }

    const video = document.getElementById('player');
    if (video) video.classList.remove('hidden');

    currentImageEntry = null;
}

function isImageViewerActive() {
    return imageWrapper && !imageWrapper.classList.contains('hidden');
}

function getCurrentImageEntry() {
    return currentImageEntry;
}

function getImageQueuePosition() {
    if (!isImageViewerActive() || !currentImageEntry) return null;
    let queue = null, currentIndex = -1;
    if (typeof getActiveQueue === 'function' && typeof nowPlayingIndex !== 'undefined') {
        queue = getActiveQueue();
        currentIndex = nowPlayingIndex;
    }
    if (!queue || queue.length === 0) return null;
    currentIndex = Math.max(0, Math.min(currentIndex, queue.length - 1));
    return { index: currentIndex + 1, total: queue.length };
}

function updateImageTimeDisplay() {
    if (!isImageViewerActive()) return;
    const pos = getImageQueuePosition();
    if (!pos) return;
    const td = document.getElementById('timeDisplay');
    if (td) td.textContent = `${pos.index}/${pos.total}`;
}

function updateImageProgressBars() {
    if (!isImageViewerActive()) return;
    const pos = getImageQueuePosition();
    if (!pos) return;
    const pb = document.getElementById('progressBar');
    if (pb) {
        pb.min = 0;
        pb.max = pos.total - 1;
        pb.step = 1;
        pb.value = pos.index - 1;
    }
}

function jumpToImageIndex(targetIndex) {
    if (typeof nowPlaying_playIndex === 'function') nowPlaying_playIndex(targetIndex);
}

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
window.showImageControls = showImageControls;
window.hideImageControls = hideImageControls;
window.scheduleControlsHide = scheduleControlsHide;
window.cancelControlsHide = cancelControlsHide;
window.isSlideshowActive = () => isSlideshowActive;
window.setSlideshowControlsVisible = (val) => { slideshowControlsVisible = val; };

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initImageViewer);
} else {
    initImageViewer();
}