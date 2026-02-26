// ===============================
// Picture-in-Picture
// ===============================
const pipBtn = document.getElementById("pipBtn");

pipBtn.addEventListener("click", async () => {
    try {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else if (document.pictureInPictureEnabled) {
            await video.requestPictureInPicture();
        } else {
            alert("Picture-in-Picture is not supported on this device.");
        }
    } catch (e) {
        alert("Unable to enter Picture-in-Picture.");
        console.error("PiP error:", e);
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

let screenCaptureStream = null;
let screenRecorder = null;
let screenChunks = [];

screenCaptureBtn.addEventListener("click", async () => {
    try {
        screenCaptureStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        video.srcObject = screenCaptureStream;
        await video.play();

        startScreenRecording(screenCaptureStream);

        screenCaptureStream.getTracks().forEach(track => {
            track.onended = () => {
                stopScreenRecording();
            };
        });

    } catch (e) {
        alert("Screen capture failed or was cancelled.");
        console.error(e);
    }
});

function startScreenRecording(stream) {
    screenChunks = [];
    screenRecorder = new MediaRecorder(stream);

    screenRecorder.ondataavailable = e => {
        if (e.data.size > 0) screenChunks.push(e.data);
    };

    screenRecorder.onstop = () => {
        const blob = new Blob(screenChunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `screen-recording-${Date.now()}.webm`;
        a.click();

        URL.revokeObjectURL(url);
    };

    screenRecorder.start();
}

function stopScreenRecording() {
    if (screenRecorder && screenRecorder.state === "recording") {
        screenRecorder.stop();
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

