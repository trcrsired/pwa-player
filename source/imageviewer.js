// ===============================
// Image Viewer Module
// ===============================

let imageElement = null;
let slideshowTimer = null;
let slideshowInterval = 5000;
let currentImageEntry = null;
let isSlideshowActive = false;
let controlsHideTimer = null;
let isInteractingWithControls = false; // Flag to prevent hiding when using controls
let slideshowControlsVisible = false; // Track whether user wants controls visible during slideshow

// Scale levels
const SCALE_LEVELS = [1, 1.5, 2, 3, 0.75];
let currentScaleIndex = 0;

// Pan state
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };
let lastPanOffset = { x: 0, y: 0 };

// Add interaction flag handlers immediately with capture phase (fires BEFORE bubble phase)
// This ensures the flag is set BEFORE playPrevious/playNext are called by nowplaying.js handlers
document.getElementById("prevBtn")?.addEventListener("click", () => { isInteractingWithControls = true; }, true);
document.getElementById("nextBtn")?.addEventListener("click", () => { isInteractingWithControls = true; }, true);
document.getElementById("npPrevBtn")?.addEventListener("click", () => { isInteractingWithControls = true; }, true);
document.getElementById("npNextBtn")?.addEventListener("click", () => { isInteractingWithControls = true; }, true);

// Initialize
function initImageViewer() {
    imageElement = document.getElementById('imageDisplay');
    if (!imageElement) return;

    // Click on zoomed image to set zoom focus
    imageElement.addEventListener('click', handleZoomedImageClick);

    // Mouse events for panning when zoomed
    imageElement.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    imageElement.addEventListener('wheel', handleWheel, { passive: false });
    imageElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    imageElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    imageElement.addEventListener('touchend', handleTouchEnd);
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
    if (currentScaleIndex === -1) {
        // Pinch zoom mode - get scale from transform
        const transform = imageElement.style.transform;
        const scaleMatch = transform.match(/scale\(([\d.]+)\)/);
        return scaleMatch ? parseFloat(scaleMatch[1]) : 1;
    }
    return SCALE_LEVELS[currentScaleIndex];
}

function handleWheel(event) {
    if (!isImageViewerActive()) return;
    event.preventDefault();
    if (event.deltaY < 0) zoomIn(event.clientX, event.clientY);
    else zoomOut();
}

function zoomIn(clientX, clientY) {
    // If in pinch-zoom mode, snap to nearest predefined scale first
    if (currentScaleIndex === -1) {
        const currentScale = getCurrentScale();
        // Find the next higher predefined scale
        for (let i = 0; i < SCALE_LEVELS.length; ++i) {
            if (SCALE_LEVELS[i] > currentScale) {
                currentScaleIndex = i;
                if (clientX !== undefined && clientY !== undefined) {
                    const rect = imageElement.getBoundingClientRect();
                    const xPercent = ((clientX - rect.left) / rect.width) * 100;
                    const yPercent = ((clientY - rect.top) / rect.height) * 100;
                    imageElement.style.transformOrigin = `${xPercent}% ${yPercent}%`;
                }
                applyPanAndZoom();
                updateCursor();
                updateMagnifierButton();
                return;
            }
        }
        return; // Already at max scale
    }

    if (currentScaleIndex < SCALE_LEVELS.length - 1 && SCALE_LEVELS[currentScaleIndex + 1] > SCALE_LEVELS[currentScaleIndex]) {
        currentScaleIndex++;
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
        for (let i = 0; i < SCALE_LEVELS.length; ++i) {
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

function zoomOut() {
    // If in pinch-zoom mode, snap to nearest predefined scale first
    if (currentScaleIndex === -1) {
        const currentScale = getCurrentScale();
        // Find the next lower predefined scale
        for (let i = SCALE_LEVELS.length - 1; i >= 0; i--) {
            if (SCALE_LEVELS[i] < currentScale) {
                currentScaleIndex = i;
                if (SCALE_LEVELS[currentScaleIndex] === 1) {
                    panOffset = { x: 0, y: 0 };
                    imageElement.style.transformOrigin = 'center center';
                }
                applyPanAndZoom();
                updateCursor();
                updateMagnifierButton();
                return;
            }
        }
        currentScaleIndex = 0; // Go to minimum
        panOffset = { x: 0, y: 0 };
        imageElement.style.transformOrigin = 'center center';
        applyPanAndZoom();
        updateCursor();
        updateMagnifierButton();
        return;
    }

    if (currentScaleIndex > 0 && SCALE_LEVELS[currentScaleIndex - 1] < SCALE_LEVELS[currentScaleIndex]) {
        currentScaleIndex--;
        if (SCALE_LEVELS[currentScaleIndex] === 1) {
            panOffset = { x: 0, y: 0 };
            imageElement.style.transformOrigin = 'center center';
        }
        applyPanAndZoom();
        updateCursor();
        updateMagnifierButton();
    } else if (SCALE_LEVELS[currentScaleIndex] > 1) {
        for (let i = currentScaleIndex - 1; i >= 0; i--) {
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

function updateCursor() {
    imageElement.style.cursor = getCurrentScale() > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default';
}

// Handle click on zoomed image to set zoom focus point
function handleZoomedImageClick(event) {
    if (getCurrentScale() === 1) return;

    // Stop propagation so playerWrapper doesn't handle this click
    event.stopPropagation();

    const rect = imageElement.getBoundingClientRect();
    const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
    imageElement.style.transformOrigin = `${xPercent}% ${yPercent}%`;
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

function handleMouseDown(event) {
    if (getCurrentScale() === 1) return;
    event.preventDefault();
    isPanning = true;
    panStart = { x: event.clientX, y: event.clientY };
    lastPanOffset = { ...panOffset };
    imageElement.style.cursor = 'grabbing';
}

function handleMouseMove(event) {
    if (!isPanning) return;
    const scale = getCurrentScale();
    panOffset = {
        x: lastPanOffset.x + (event.clientX - panStart.x) / scale,
        y: lastPanOffset.y + (event.clientY - panStart.y) / scale
    };
    applyPanAndZoom();
}

function handleMouseUp() {
    isPanning = false;
    updateCursor();
}

function applyPanAndZoom() {
    const scale = getCurrentScale();
    imageElement.style.transform = `scale(${scale}) translate(${panOffset.x}px, ${panOffset.y}px)`;
}

function handleMagnifierClick(event) {
    event.stopPropagation();
    currentScaleIndex = (currentScaleIndex + 1) % SCALE_LEVELS.length;
    if (SCALE_LEVELS[currentScaleIndex] === 1) {
        panOffset = { x: 0, y: 0 };
        imageElement.style.transformOrigin = 'center center';
        imageElement.style.transform = 'scale(1)';
    } else {
        applyPanAndZoom();
    }
    updateCursor();
    updateMagnifierButton();
}

function updateMagnifierButton() {
    const btn = document.getElementById('magnifierBtn');
    if (!btn) return;
    btn.textContent = getCurrentScale() >= 2 ? '🔎' : '🔍';
    btn.title = getCurrentScale() >= 2 ? 'Zoom Out' : 'Zoom In';
}

let touchStartTime = 0, lastTouchX = 0, lastTouchY = 0;
let isPinching = false;
let pinchStartDistance = 0;
let pinchStartScale = 1;
let pinchCenter = { x: 0, y: 0 };

function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getTouchCenter(touches) {
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
    };
}

function handleTouchStart(event) {
    touchStartTime = Date.now();

    if (event.touches.length === 2) {
        // Pinch zoom start
        event.preventDefault();
        isPinching = true;
        isPanning = false;
        pinchStartDistance = getTouchDistance(event.touches);
        pinchStartScale = getCurrentScale();
        pinchCenter = getTouchCenter(event.touches);

        // Set transform origin to pinch center
        const rect = imageElement.getBoundingClientRect();
        const xPercent = ((pinchCenter.x - rect.left) / rect.width) * 100;
        const yPercent = ((pinchCenter.y - rect.top) / rect.height) * 100;
        imageElement.style.transformOrigin = `${xPercent}% ${yPercent}%`;
    } else if (event.touches.length === 1) {
        lastTouchX = event.touches[0].clientX;
        lastTouchY = event.touches[0].clientY;
        if (getCurrentScale() !== 1) {
            event.preventDefault();
            isPanning = true;
            panStart = { x: lastTouchX, y: lastTouchY };
            lastPanOffset = { ...panOffset };
        }
    }
}

function handleTouchMove(event) {
    if (event.touches.length === 2 && isPinching) {
        event.preventDefault();

        const currentDistance = getTouchDistance(event.touches);
        const scaleRatio = currentDistance / pinchStartDistance;
        const newScale = pinchStartScale * scaleRatio;

        // Clamp scale to reasonable range
        const minScale = 0.5;
        const maxScale = 5;
        const clampedScale = Math.max(minScale, Math.min(maxScale, newScale));

        // Find the closest scale index or use direct scale
        // For pinch zoom, use direct scale value instead of predefined levels
        currentScaleIndex = -1; // Special index for pinch zoom
        imageElement.style.transform = `scale(${clampedScale}) translate(${panOffset.x}px, ${panOffset.y}px)`;
        updateCursor();
        updateMagnifierButton();
    } else if (!isPinching && isPanning && event.touches.length === 1) {
        event.preventDefault();
        const scale = getCurrentScale();
        panOffset = {
            x: lastPanOffset.x + (event.touches[0].clientX - panStart.x) / scale,
            y: lastPanOffset.y + (event.touches[0].clientY - panStart.y) / scale
        };
        applyPanAndZoom();
    }
}

function handleTouchEnd(event) {
    // If ending pinch, find nearest scale level
    if (isPinching && event.touches.length < 2) {
        isPinching = false;

        // Get current scale from transform
        const transform = imageElement.style.transform;
        const scaleMatch = transform.match(/scale\(([\d.]+)\)/);
        if (scaleMatch) {
            const currentScale = parseFloat(scaleMatch[1]);
            // Find closest predefined scale level
            let closestIndex = 0;
            let closestDiff = Math.abs(SCALE_LEVELS[0] - currentScale);
            for (let i = 1; i < SCALE_LEVELS.length; ++i) {
                const diff = Math.abs(SCALE_LEVELS[i] - currentScale);
                if (diff < closestDiff) {
                    closestDiff = diff;
                    closestIndex = i;
                }
            }
            currentScaleIndex = closestIndex;

            if (SCALE_LEVELS[currentScaleIndex] === 1) {
                panOffset = { x: 0, y: 0 };
                imageElement.style.transformOrigin = 'center center';
            }
            applyPanAndZoom();
            updateCursor();
            updateMagnifierButton();
        }
    }

    if (event.touches.length === 0) {
        isPanning = false;
        updateCursor();

        // Handle tap only if not pinching and quick tap
        if (!isPinching && Date.now() - touchStartTime < 200 && getCurrentScale() === 1) {
            // Use entire window dimensions for zone detection (not limited to playerWrapper)
            const width = window.innerWidth;
            const height = window.innerHeight;

            if (lastTouchY > height * 0.8) {
                showImageControls();
            } else if (lastTouchX < width * 0.3) {
                cancelControlsHide();
                hideImageControls();
                if (typeof playPrevious === 'function') playPrevious();
            } else if (lastTouchX > width * 0.7) {
                cancelControlsHide();
                hideImageControls();
                handleNextWithLoopCheck();
            }
        }
    }
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

async function viewImage(sourceobject, entryPath) {
    if (!imageElement) initImageViewer();

    const video = document.getElementById('player');
    const embedded = document.getElementById('embeddedPlayer');
    const overlay = document.getElementById('videoStatusOverlay');

    if (video) { video.classList.add('hidden'); video.pause(); }
    if (embedded) embedded.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');

    imageElement.classList.remove('hidden');

    const magBtn = document.getElementById('magnifierBtn');
    if (magBtn) { magBtn.classList.remove('hidden'); updateMagnifierButton(); }

    // Handle controls visibility based on context
    // During slideshow, respect slideshowControlsVisible flag (user's preference)
    // Otherwise, use isInteractingWithControls for normal navigation
    if (isSlideshowActive) {
        // During slideshow - respect user's preference for controls visibility
        if (slideshowControlsVisible) {
            // User wants controls visible during slideshow
            const controls = document.getElementById('controls');
            if (controls) controls.classList.remove('hidden');
            scheduleControlsHide();
        } else {
            // User wants controls hidden during slideshow
            cancelControlsHide();
            const controls = document.getElementById('controls');
            if (controls) controls.classList.add('hidden');
        }
    } else if (isInteractingWithControls) {
        // User is using controls (prev/next buttons, progressbar) - keep controls visible
        isInteractingWithControls = false;
        showImageControls();
    } else {
        // User navigated via image click zones - hide controls
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
        panOffset = { x: 0, y: 0 };
        imageElement.style.transform = 'scale(1)';
        imageElement.style.cursor = 'default';
        imageElement.style.transformOrigin = 'center center';

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

    if (imageElement) {
        imageElement.classList.add('hidden');
        imageElement.src = '';
        currentScaleIndex = 0;
        panOffset = { x: 0, y: 0 };
        imageElement.style.transform = 'scale(1)';
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
    return imageElement && !imageElement.classList.contains('hidden');
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
window.isSlideshowActive = () => isSlideshowActive; // Expose slideshow state
window.setSlideshowControlsVisible = (val) => { slideshowControlsVisible = val; }; // Allow external setting

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initImageViewer);
} else {
    initImageViewer();
}