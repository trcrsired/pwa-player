// ===============================
// Picture-in-Picture
// ===============================
const pipBtn = document.getElementById("pipBtn");

pipBtn.addEventListener("click", async () => {
    try {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else if (document.pictureInPictureEnabled) {
            // Reset subtitle position before entering PiP (no controls in PiP window)
            if (typeof updateSubtitlePosition === 'function') {
                updateSubtitlePosition(false);
            }
            await video.requestPictureInPicture();
        } else {
            alert("Picture-in-Picture is not supported on this device.");
        }
    } catch (e) {
        alert("Unable to enter Picture-in-Picture.");
        console.error("PiP error:", e);
    }
});

// Restore subtitle position when exiting PiP
video.addEventListener('leavepictureinpicture', () => {
    if (typeof updateSubtitlePosition === 'function' && !controls.classList.contains('hidden')) {
        updateSubtitlePosition(true);
    }
});


// ===============================
// Remote Playback
// ===============================
const remoteBtn = document.getElementById("remoteBtn");

remoteBtn.addEventListener("click", async () => {
    if (!("remote" in video)) {
        alert("Remote Playback is not supported in this browser.");
        return;
    }

    try {
        await video.remote.prompt();
    } catch (e) {
        if (e.name === "NotAllowedError") {
            alert("No remote playback devices available or request was dismissed.");
        } else {
            alert("Remote Playback failed.");
            console.error("Remote playback error:", e);
        }
    }
});

// ===============================
// Screen Capture
// ===============================

const screenCaptureBtn = document.getElementById("screenCaptureBtn");

// Hide screen capture button if not supported
if (!navigator.mediaDevices?.getDisplayMedia) {
    screenCaptureBtn.style.display = 'none';
}

let micToggleBtn = null;
let switchCaptureBtn = null;

let screenCaptureStream = null;
let screenRecorder = null;
let screenChunks = [];
let micStream = null;
let audioContext = null;
let micGainNode = null;
let screenAudioSource = null;
let micAudioSource = null;
let recordingDestination = null;
let isMicEnabled = false;
let previousVideoMuted = false;

// Canvas-based recording for seamless source switching
let captureCanvas = null;
let captureCtx = null;
let captureAnimationId = null;
let currentCaptureVideo = null;

function getMicToggleBtn() {
    if (!micToggleBtn) {
        micToggleBtn = document.getElementById("micToggleBtn");
    }
    return micToggleBtn;
}

function getSwitchCaptureBtn() {
    if (!switchCaptureBtn) {
        switchCaptureBtn = document.getElementById("switchCaptureBtn");
    }
    return switchCaptureBtn;
}

// Draw captured video to canvas continuously
function drawCaptureToCanvas() {
    if (!captureCtx || !currentCaptureVideo) return;

    const vw = currentCaptureVideo.videoWidth;
    const vh = currentCaptureVideo.videoHeight;

    if (vw > 0 && vh > 0) {
        // Resize canvas to match video
        if (captureCanvas.width !== vw || captureCanvas.height !== vh) {
            captureCanvas.width = vw;
            captureCanvas.height = vh;
        }
        captureCtx.drawImage(currentCaptureVideo, 0, 0, vw, vh);
    }

    captureAnimationId = requestAnimationFrame(drawCaptureToCanvas);
}

screenCaptureBtn.addEventListener("click", async () => {
    if (screenRecorder && screenRecorder.state === "recording") {
        stopScreenRecording();
        return;
    }

    try {
        screenCaptureStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        // Create canvas for recording (stays constant across source switches)
        captureCanvas = document.createElement('canvas');
        captureCtx = captureCanvas.getContext('2d');

        // Create video element to feed the canvas
        currentCaptureVideo = document.createElement('video');
        currentCaptureVideo.srcObject = screenCaptureStream;
        currentCaptureVideo.muted = true;
        await currentCaptureVideo.play();

        // Start drawing to canvas
        drawCaptureToCanvas();

        // Set up AudioContext for mixing
        audioContext = new AudioContext();
        recordingDestination = audioContext.createMediaStreamDestination();

        // Connect screen audio to recording destination
        const screenAudioTracks = screenCaptureStream.getAudioTracks();
        if (screenAudioTracks.length > 0) {
            try {
                screenAudioSource = audioContext.createMediaStreamSource(
                    new MediaStream([screenAudioTracks[0]])
                );
                screenAudioSource.connect(recordingDestination);
            } catch (audioErr) {
                console.warn("Could not connect screen audio:", audioErr);
            }
        }

        // Save previous mute state and mute video to prevent audio playback
        previousVideoMuted = video.muted;
        video.muted = true;

        // Show capture in main video element (muted)
        video.srcObject = screenCaptureStream;
        await video.play();

        // Create recording stream from canvas + mixed audio
        const canvasStream = captureCanvas.captureStream(30); // 30fps
        const videoTrack = canvasStream.getVideoTracks()[0];
        const audioTracks = recordingDestination.stream.getAudioTracks();

        let recordingStream;
        if (audioTracks.length > 0) {
            recordingStream = new MediaStream([videoTrack, audioTracks[0]]);
        } else {
            recordingStream = new MediaStream([videoTrack]);
        }

        // Start recording
        startScreenRecording(recordingStream);

        // Show mic toggle and switch capture buttons
        const micBtn = getMicToggleBtn();
        if (micBtn) micBtn.style.display = "";
        const switchBtn = getSwitchCaptureBtn();
        if (switchBtn) switchBtn.style.display = "";
        screenCaptureBtn.textContent = "⏹️";

        // Handle track ended
        screenCaptureStream.getVideoTracks()[0].onended = () => {
            stopScreenRecording();
        };

    } catch (e) {
        if (e.name === "NotAllowedError" || e.name === "AbortError") {
            console.log("Screen capture cancelled by user");
        } else {
            alert("Screen capture failed: " + e.message);
        }
        console.error(e);
        cleanupCaptureResources();
    }
});

async function toggleMicInRecording() {
    if (!screenRecorder || screenRecorder.state !== "recording") {
        return;
    }

    const micBtn = getMicToggleBtn();

    if (isMicEnabled) {
        // Turn off mic
        if (micGainNode) {
            micGainNode.gain.value = 0;
        }
        isMicEnabled = false;
        if (micBtn) micBtn.textContent = "🎤";
    } else {
        // Turn on mic
        try {
            if (!micStream) {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                micAudioSource = audioContext.createMediaStreamSource(micStream);
                micGainNode = audioContext.createGain();
                micAudioSource.connect(micGainNode);
                micGainNode.connect(recordingDestination);
            }
            micGainNode.gain.value = 1;
            isMicEnabled = true;
            if (micBtn) micBtn.textContent = "🎙️";
        } catch (micErr) {
            console.warn("Could not get microphone:", micErr);
            alert("Could not access microphone.");
        }
    }
}

async function switchCaptureSource() {
    if (!screenRecorder || screenRecorder.state !== "recording") {
        return;
    }

    try {
        // Get new screen capture
        const newStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        // Stop old screen capture tracks
        if (screenCaptureStream) {
            screenCaptureStream.getVideoTracks().forEach(track => track.stop());
            screenCaptureStream.getAudioTracks().forEach(track => track.stop());
        }

        screenCaptureStream = newStream;

        // Disconnect old screen audio source
        if (screenAudioSource) {
            screenAudioSource.disconnect();
            screenAudioSource = null;
        }

        // Connect new screen audio to existing recording destination
        const screenAudioTracks = newStream.getAudioTracks();
        if (screenAudioTracks.length > 0) {
            screenAudioSource = audioContext.createMediaStreamSource(
                new MediaStream([screenAudioTracks[0]])
            );
            screenAudioSource.connect(recordingDestination);
        }

        // Switch the video that feeds the canvas (canvas stream stays the same)
        currentCaptureVideo.srcObject = newStream;
        await currentCaptureVideo.play();

        // Keep main video muted
        video.muted = true;
        video.srcObject = newStream;
        await video.play();

        // Handle track ended
        newStream.getVideoTracks()[0].onended = () => {
            stopScreenRecording();
        };

    } catch (e) {
        if (e.name !== "NotAllowedError" && e.name !== "AbortError") {
            alert("Failed to switch capture: " + e.message);
        }
        console.log("Switch capture cancelled or failed:", e);
    }
}

function cleanupCaptureResources() {
    // Stop animation loop
    if (captureAnimationId) {
        cancelAnimationFrame(captureAnimationId);
        captureAnimationId = null;
    }

    // Clean up video element
    if (currentCaptureVideo) {
        currentCaptureVideo.srcObject = null;
        currentCaptureVideo = null;
    }

    captureCanvas = null;
    captureCtx = null;

    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
    if (screenCaptureStream) {
        screenCaptureStream.getTracks().forEach(track => track.stop());
        screenCaptureStream = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    isMicEnabled = false;
    micGainNode = null;
    screenAudioSource = null;
    micAudioSource = null;
    recordingDestination = null;
}

document.addEventListener("DOMContentLoaded", () => {
    const micBtn = getMicToggleBtn();
    if (micBtn) {
        micBtn.addEventListener("click", toggleMicInRecording);
    }
    const switchBtn = getSwitchCaptureBtn();
    if (switchBtn) {
        switchBtn.addEventListener("click", switchCaptureSource);
    }
});

const micBtnImmediate = document.getElementById("micToggleBtn");
if (micBtnImmediate) {
    micBtnImmediate.addEventListener("click", toggleMicInRecording);
}
const switchBtnImmediate = document.getElementById("switchCaptureBtn");
if (switchBtnImmediate) {
    switchBtnImmediate.addEventListener("click", switchCaptureSource);
}

function saveScreenRecording() {
    const blob = new Blob(screenChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `screen-recording-${Date.now()}.webm`;
    a.click();

    URL.revokeObjectURL(url);
}

function startScreenRecording(stream) {
    screenChunks = [];
    screenRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm; codecs=vp9"
    });

    screenRecorder.ondataavailable = e => {
        if (e.data.size > 0) screenChunks.push(e.data);
    };

    screenRecorder.onstop = saveScreenRecording;

    screenRecorder.start();
}

function stopScreenRecording() {
    if (screenRecorder && screenRecorder.state === "recording") {
        screenRecorder.stop();
    }

    cleanupCaptureResources();

    // Restore previous mute state
    video.muted = previousVideoMuted;

    screenCaptureBtn.textContent = "🖥️";
    const micBtn = getMicToggleBtn();
    if (micBtn) {
        micBtn.style.display = "none";
        micBtn.textContent = "🎤";
    }
    const switchBtn = getSwitchCaptureBtn();
    if (switchBtn) {
        switchBtn.style.display = "none";
    }
}

// ===============================
// Battery Status
// ===============================
const batteryStatus = document.getElementById("batteryStatus");

if (navigator.getBattery) {
    navigator.getBattery().then(battery => {
        const updateBattery = () => {
            const level = Math.round(battery.level * 100);
            const charging = battery.charging ? "⚡" : "";
            batteryStatus.textContent = `🔋 ${level}%${charging}`;
        };

        updateBattery();
        battery.addEventListener("levelchange", updateBattery);
        battery.addEventListener("chargingchange", updateBattery);
    }).catch(e => {
        alert("Unable to read battery status.");
        console.error("Battery API error:", e);
    });
} else {
    batteryStatus.textContent = "🔋 n/a";
}


// ===============================
// Record
// ===============================

const mediaRecordBtn = document.getElementById("mediaRecordBtn");

let mediaRecorder = null;
let recordedChunks = [];
let videoStream = null;

// Start recording the <video> element
function startVideoRecording() {

    // Check if video is ready
    if (video.readyState < 2) {
        alert("Video is not ready yet. Please start playing the video first.");
        return;
    }

    // Check if captureStream is supported
    if (!video.captureStream && !video.mozCaptureStream) {
        alert("Your browser does not support video recording.");
        return;
    }

    // Try to get stream
    videoStream = video.captureStream ? video.captureStream() : video.mozCaptureStream();

    // Check if stream has tracks
    if (!videoStream || videoStream.getTracks().length === 0) {
        alert("Unable to record this video. It may be cross-origin or not allowed.");
        return;
    }

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(videoStream, {
        mimeType: "video/webm; codecs=vp9"
    });

    mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = saveVideoRecording;

    mediaRecorder.start();
    mediaRecordBtn.textContent = "⏹️";
    alert("Recording started.");
}

// Save the recorded file
function saveVideoRecording() {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `video-recording-${Date.now()}.webm`;
    a.click();

    URL.revokeObjectURL(url);
// Reset recorder state
    mediaRecorder = null;
    videoStream = null;
    recordedChunks = [];
}

// Stop recording
function stopVideoRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }
    mediaRecordBtn.textContent = "⏺️";
    alert("Recording stopped.");
}

// Toggle button
mediaRecordBtn.addEventListener("click", () => {
    if (!mediaRecorder) {
        startVideoRecording();
        return;
    }

    if (mediaRecorder.state === "recording") {
        stopVideoRecording();
    } else {
        mediaRecorder.start();
        mediaRecordBtn.textContent = "⏹️";
        alert("Recording started.");
    }
});

// ===============================
// Video Screenshot (WebP, safe)
// ===============================

const screenshotBtn = document.getElementById("screenshotBtn");

screenshotBtn.addEventListener("click", async () => {

    // Ensure video is ready
    if (video.readyState < 2) {
        alert("Video is not ready yet. Please start playing the video first.");
        return;
    }

    // Prepare canvas
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    try {
        // Try drawing the video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (err) {
        alert("Unable to capture screenshot. The video source may be cross-origin without CORS.");
        console.error(err);
        return;
    }

    // Try exporting WebP
    canvas.toBlob(blob => {
        if (!blob) {
            alert("Screenshot failed. The video source may not allow capturing.");
            return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `screenshot-${Date.now()}.webp`;
        a.click();
        URL.revokeObjectURL(url);

    }, "image/webp");
});

// ===============================
// Network Information
// ===============================
const networkStatus = document.getElementById("networkStatus");
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

function updateNetwork() {
    if (!connection) {
        networkStatus.textContent = "🌐 n/a";
        return;
    }

    const type = connection.effectiveType || "unknown";
    const down = connection.downlink ? `${connection.downlink}Mbps` : "";
    networkStatus.textContent = `🌐 ${type} ${down}`.trim();
}

if (connection) {
    updateNetwork();
    connection.addEventListener("change", updateNetwork);
} else {
    networkStatus.textContent = "🌐 n/a";
}

// ===============================
// Floating Scroll Buttons
// ===============================
let scrollUpBtn = null;
let scrollDownBtn = null;

function initScrollButtons() {
    scrollUpBtn = document.getElementById("scrollUpBtn");
    scrollDownBtn = document.getElementById("scrollDownBtn");

    if (!scrollUpBtn || !scrollDownBtn) return;

    scrollUpBtn.addEventListener("click", () => {
        const view = getActiveOverlayView();
        const content = view ? view.querySelector(".content") : null;
        if (content) {
            content.scrollTo({ top: 0, behavior: "smooth" });
        }
    });

    scrollDownBtn.addEventListener("click", () => {
        const view = getActiveOverlayView();
        const content = view ? view.querySelector(".content") : null;
        if (content) {
            content.scrollTo({ top: content.scrollHeight, behavior: "smooth" });
        }
    });

    // Set up scroll listeners
    document.querySelectorAll(".overlay-view .content").forEach(content => {
        content.addEventListener("scroll", updateScrollButtons);
    });
}

function getActiveOverlayView() {
    const views = document.querySelectorAll(".overlay-view");
    for (const view of views) {
        if (!view.classList.contains("hidden")) {
            return view;
        }
    }
    return null;
}

function updateScrollButtons() {
    if (!scrollUpBtn || !scrollDownBtn) return;

    const view = getActiveOverlayView();
    const content = view ? view.querySelector(".content") : null;

    if (!content) {
        scrollUpBtn.classList.remove("visible");
        scrollDownBtn.classList.remove("visible");
        return;
    }

    const scrollTop = content.scrollTop;
    const scrollHeight = content.scrollHeight;
    const clientHeight = content.clientHeight;

    // Only show buttons if there's scrollable content
    if (scrollHeight <= clientHeight + 10) {
        scrollUpBtn.classList.remove("visible");
        scrollDownBtn.classList.remove("visible");
        return;
    }

    // Show up button if not at top
    if (scrollTop > 50) {
        scrollUpBtn.classList.add("visible");
    } else {
        scrollUpBtn.classList.remove("visible");
    }

    // Show down button if not at bottom
    if (scrollTop + clientHeight < scrollHeight - 50) {
        scrollDownBtn.classList.add("visible");
    } else {
        scrollDownBtn.classList.remove("visible");
    }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initScrollButtons);
} else {
    initScrollButtons();
}

// Hook into switchView to update buttons when view changes
const _originalSwitchView = window.switchView;
window.switchView = function(viewId) {
    if (_originalSwitchView) {
        _originalSwitchView(viewId);
    }
    setTimeout(updateScrollButtons, 100);
};

// Also hook into closeActiveView to hide buttons
const _originalCloseActiveView = window.closeActiveView;
window.closeActiveView = function() {
    if (_originalCloseActiveView) {
        _originalCloseActiveView();
    }
    if (scrollUpBtn) scrollUpBtn.classList.remove("visible");
    if (scrollDownBtn) scrollDownBtn.classList.remove("visible");
};

