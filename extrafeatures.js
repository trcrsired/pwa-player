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
// Screen Capture + Auto Recording
// ===============================
const screenCaptureBtn = document.getElementById("screenCaptureBtn");
const mediaRecordBtn = document.getElementById("mediaRecordBtn");

let captureStream = null;
let mediaRecorder = null;
let recordedChunks = [];

screenCaptureBtn.addEventListener("click", async () => {
    try {
        captureStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        video.srcObject = captureStream;
        await video.play();

        startRecording(captureStream);

        captureStream.getTracks().forEach(track => {
            track.onended = () => {
                alert("Screen sharing stopped. Saving recording...");
                stopRecordingAndSave();
            };
        });

    } catch (e) {
        if (e.name === "NotAllowedError") {
            alert("Screen capture was cancelled.");
        } else {
            alert("Screen capture failed.");
            console.error("Screen capture error:", e);
        }
    }
});


// Manual record toggle
mediaRecordBtn.addEventListener("click", () => {
    if (!mediaRecorder) {
        alert("Start screen capture before recording.");
        return;
    }

    if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        mediaRecordBtn.textContent = "⏺️";
        alert("Recording stopped.");
    } else {
        startRecording(captureStream);
        mediaRecordBtn.textContent = "⏹️";
        alert("Recording started.");
    }
});


// Start recording helper
function startRecording(stream) {
    try {
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.start();
        mediaRecordBtn.textContent = "⏹️";
    } catch (e) {
        alert("Unable to start recording.");
        console.error("Recording error:", e);
    }
}


// Stop + save helper
function stopRecordingAndSave() {
    if (!mediaRecorder) return;

    mediaRecorder.onstop = () => {
        try {
            const blob = new Blob(recordedChunks, { type: "video/webm" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = `screen-recording-${Date.now()}.webm`;
            a.click();

            URL.revokeObjectURL(url);
        } catch (e) {
            alert("Failed to save recording.");
            console.error("Save error:", e);
        }
    };

    if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }

    mediaRecordBtn.textContent = "⏺️";
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
