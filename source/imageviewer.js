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

// Scale levels for magnifier button cycling
const SCALE_LEVELS = [1, 1.5, 2, 3, 0.75];
let currentScaleIndex = 0;

// Rotation and flip state
let rotationAngle = 0; // 0, 90, 180, 270
let flipHorizontal = false;
let flipVertical = false;

// Touch pinch-zoom state
let touchStartDistance = 0;
let touchStartScale = 1;
let touchStartCenterX = 0;
let touchStartCenterY = 0;
let isTouchZooming = false;

// Pan state for mouse/touch drag when zoomed
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panOffsetX = 0;
let panOffsetY = 0;

// Add interaction flag handlers immediately with capture phase (fires BEFORE bubble phase)
document.getElementById("prevBtn")?.addEventListener("click", () => { isInteractingWithControls = true; }, true);
document.getElementById("nextBtn")?.addEventListener("click", () => { isInteractingWithControls = true; }, true);
document.getElementById("npPrevBtn")?.addEventListener("click", () => { isInteractingWithControls = true; }, true);
document.getElementById("npNextBtn")?.addEventListener("click", () => { isInteractingWithControls = true; }, true);

// Initialize
function initImageViewer() {
    imageElement = document.getElementById('imageDisplay');
    if (!imageElement) return;

    // Touch handlers for pinch-zoom and pan on mobile
    imageElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    imageElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    imageElement.addEventListener('touchend', handleTouchEnd, { passive: false });

    // Mouse drag for panning when zoomed (desktop)
    imageElement.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Wheel for zoom (mouse/trackpad)
    imageElement.addEventListener('wheel', handleWheel, { passive: false });

    // Keyboard navigation
    document.addEventListener('keydown', handleKeyDown);

    const magnifierBtn = document.getElementById('magnifierBtn');
    if (magnifierBtn) magnifierBtn.addEventListener('click', handleMagnifierClick);

    const rotateLeftBtn = document.getElementById('rotateLeftBtn');
    if (rotateLeftBtn) rotateLeftBtn.addEventListener('click', handleRotateLeft);

    const rotateRightBtn = document.getElementById('rotateRightBtn');
    if (rotateRightBtn) rotateRightBtn.addEventListener('click', handleRotateRight);

    const flipHBtn = document.getElementById('flipHBtn');
    if (flipHBtn) flipHBtn.addEventListener('click', handleFlipHorizontal);

    const flipVBtn = document.getElementById('flipVBtn');
    if (flipVBtn) flipVBtn.addEventListener('click', handleFlipVertical);

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

// Touch handlers for pinch-zoom and pan on mobile
function getTouchDistance(touches) {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getTouchCenter(touches) {
    if (touches.length < 2) return { x: touches[0].clientX, y: touches[0].clientY };
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
    };
}

function handleTouchStart(event) {
    if (!isImageViewerActive()) return;

    if (event.touches.length === 2) {
        // Start pinch-zoom
        event.preventDefault();
        isTouchZooming = true;
        isPanning = false;
        touchStartDistance = getTouchDistance(event.touches);
        touchStartScale = getCurrentScale();
        const center = getTouchCenter(event.touches);
        touchStartCenterX = center.x;
        touchStartCenterY = center.y;
    } else if (event.touches.length === 1 && getCurrentScale() > 1) {
        // Start pan with single finger when zoomed
        isTouchZooming = false;
        isPanning = true;
        panStartX = event.touches[0].clientX - panOffsetX;
        panStartY = event.touches[0].clientY - panOffsetY;
    }
}

function handleTouchMove(event) {
    if (!isImageViewerActive()) return;

    if (isTouchZooming && event.touches.length === 2) {
        event.preventDefault();
        const currentDistance = getTouchDistance(event.touches);
        if (touchStartDistance > 0) {
            const scale = touchStartScale * (currentDistance / touchStartDistance);
            // Clamp scale to reasonable range
            const clampedScale = Math.max(0.5, Math.min(5, scale));

            // Update scale index to match (for magnifier button)
            currentScaleIndex = -1; // Custom scale mode

            // Calculate pan based on center movement
            const center = getTouchCenter(event.touches);
            const dx = center.x - touchStartCenterX;
            const dy = center.y - touchStartCenterY;
            panOffsetX += dx;
            panOffsetY += dy;
            touchStartCenterX = center.x;
            touchStartCenterY = center.y;

            // Apply transform
            imageElement.style.transform = `translate(${panOffsetX}px, ${panOffsetY}px) scale(${clampedScale})`;
            updateCursor();
            updateMagnifierButton();
        }
    } else if (isPanning && event.touches.length === 1) {
        event.preventDefault();
        panOffsetX = event.touches[0].clientX - panStartX;
        panOffsetY = event.touches[0].clientY - panStartY;
        applyScale();
    }
}

function handleTouchEnd(event) {
    if (isTouchZooming) {
        // Snap to nearest predefined scale
        const currentScale = getCurrentScale();
        let nearestIndex = 0;
        let minDiff = Math.abs(SCALE_LEVELS[0] - currentScale);
        for (let i = 1; i < SCALE_LEVELS.length; ++i) {
            const diff = Math.abs(SCALE_LEVELS[i] - currentScale);
            if (diff < minDiff) {
                minDiff = diff;
                nearestIndex = i;
            }
        }
        currentScaleIndex = nearestIndex;
        if (SCALE_LEVELS[currentScaleIndex] === 1) {
            panOffsetX = 0;
            panOffsetY = 0;
            imageElement.style.transformOrigin = 'center center';
        }
        applyScale();
        updateCursor();
        updateMagnifierButton();
    }
    isTouchZooming = false;
    isPanning = false;
}

// Mouse drag handlers for panning when zoomed (desktop)
function handleMouseDown(event) {
    if (!isImageViewerActive()) return;
    if (getCurrentScale() <= 1) return;
    if (event.button !== 0) return;

    isPanning = true;
    panStartX = event.clientX - panOffsetX;
    panStartY = event.clientY - panOffsetY;
    imageElement.style.cursor = 'grabbing';
    event.preventDefault();
}

function handleMouseMove(event) {
    if (!isPanning) return;
    panOffsetX = event.clientX - panStartX;
    panOffsetY = event.clientY - panStartY;
    applyScale();
}

function handleMouseUp(event) {
    if (!isPanning) return;
    isPanning = false;
    updateCursor();
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
                applyScale();
                updateCursor();
                updateMagnifierButton();
                return;
            }
        }
        return; // Already at max scale
    }

    if (currentScaleIndex < SCALE_LEVELS.length - 1 && SCALE_LEVELS[currentScaleIndex + 1] > SCALE_LEVELS[currentScaleIndex]) {
        ++currentScaleIndex;
        if (clientX !== undefined && clientY !== undefined) {
            const rect = imageElement.getBoundingClientRect();
            const xPercent = ((clientX - rect.left) / rect.width) * 100;
            const yPercent = ((clientY - rect.top) / rect.height) * 100;
            imageElement.style.transformOrigin = `${xPercent}% ${yPercent}%`;
        }
        applyScale();
        updateCursor();
        updateMagnifierButton();
    } else if (SCALE_LEVELS[currentScaleIndex] === 1) {
        for (let i = 0; i < SCALE_LEVELS.length; ++i) {
            if (SCALE_LEVELS[i] > 1) {
                currentScaleIndex = i;
                applyScale();
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
        for (let i = SCALE_LEVELS.length; i--;) {
            if (SCALE_LEVELS[i] < currentScale) {
                currentScaleIndex = i;
                if (SCALE_LEVELS[currentScaleIndex] === 1) {
                    imageElement.style.transformOrigin = 'center center';
                }
                applyScale();
                updateCursor();
                updateMagnifierButton();
                return;
            }
        }
        currentScaleIndex = 0; // Go to minimum
        panOffsetX = 0;
        panOffsetY = 0;
        imageElement.style.transformOrigin = 'center center';
        applyScale();
        updateCursor();
        updateMagnifierButton();
        return;
    }

    if (currentScaleIndex > 0 && SCALE_LEVELS[currentScaleIndex - 1] < SCALE_LEVELS[currentScaleIndex]) {
        --currentScaleIndex;
        if (SCALE_LEVELS[currentScaleIndex] === 1) {
            panOffsetX = 0;
            panOffsetY = 0;
            imageElement.style.transformOrigin = 'center center';
        }
        applyScale();
        updateCursor();
        updateMagnifierButton();
    } else if (SCALE_LEVELS[currentScaleIndex] > 1) {
        for (let i = currentScaleIndex; i--; ) {
            if (SCALE_LEVELS[i] < SCALE_LEVELS[currentScaleIndex]) {
                currentScaleIndex = i;
                if (SCALE_LEVELS[currentScaleIndex] === 1) {
                    imageElement.style.transformOrigin = 'center center';
                }
                applyScale();
                updateCursor();
                updateMagnifierButton();
                break;
            }
        }
    }
}

function updateCursor() {
    const scale = getCurrentScale();
    imageElement.style.cursor = scale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default';
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

// Apply scale, rotation, flip transforms with pan offset
function applyScale() {
    const scale = getCurrentScale();
    const scaleX = flipHorizontal ? -scale : scale;
    const scaleY = flipVertical ? -scale : scale;
    imageElement.style.transform = `translate(${panOffsetX}px, ${panOffsetY}px) rotate(${rotationAngle}deg) scale(${scaleX}, ${scaleY})`;
}

// Rotation handlers
function handleRotateLeft() {
    rotationAngle = (rotationAngle - 90) % 360;
    if (rotationAngle < 0) rotationAngle += 360;
    applyScale();
}

function handleRotateRight() {
    rotationAngle = (rotationAngle + 90) % 360;
    applyScale();
}

// Flip handlers
function handleFlipHorizontal() {
    flipHorizontal = !flipHorizontal;
    applyScale();
}

function handleFlipVertical() {
    flipVertical = !flipVertical;
    applyScale();
}

function handleMagnifierClick(event) {
    event.stopPropagation();
    currentScaleIndex = (currentScaleIndex + 1) % SCALE_LEVELS.length;
    if (SCALE_LEVELS[currentScaleIndex] === 1) {
        panOffsetX = 0;
        panOffsetY = 0;
        imageElement.style.transformOrigin = 'center center';
        imageElement.style.transform = 'scale(1)';
    } else {
        applyScale();
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

// Note: Native pinch-zoom handled by CSS touch-action. No custom touch handlers needed.

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

    const rotateLeftBtn = document.getElementById('rotateLeftBtn');
    const rotateRightBtn = document.getElementById('rotateRightBtn');
    const flipHBtn = document.getElementById('flipHBtn');
    const flipVBtn = document.getElementById('flipVBtn');
    if (rotateLeftBtn) rotateLeftBtn.classList.remove('hidden');
    if (rotateRightBtn) rotateRightBtn.classList.remove('hidden');
    if (flipHBtn) flipHBtn.classList.remove('hidden');
    if (flipVBtn) flipVBtn.classList.remove('hidden');

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
        panOffsetX = 0;
        panOffsetY = 0;
        rotationAngle = 0;
        flipHorizontal = false;
        flipVertical = false;
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
        panOffsetX = 0;
        panOffsetY = 0;
        rotationAngle = 0;
        flipHorizontal = false;
        flipVertical = false;
        imageElement.style.transform = 'scale(1)';
    }

    const magBtn = document.getElementById('magnifierBtn');
    if (magBtn) magBtn.classList.add('hidden');

    const rotateLeftBtn = document.getElementById('rotateLeftBtn');
    const rotateRightBtn = document.getElementById('rotateRightBtn');
    const flipHBtn = document.getElementById('flipHBtn');
    const flipVBtn = document.getElementById('flipVBtn');
    if (rotateLeftBtn) rotateLeftBtn.classList.add('hidden');
    if (rotateRightBtn) rotateRightBtn.classList.add('hidden');
    if (flipHBtn) flipHBtn.classList.add('hidden');
    if (flipVBtn) flipVBtn.classList.add('hidden');

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