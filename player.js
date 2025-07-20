if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js")
    .then(() => console.log("✅ Service Worker registered"))
    .catch((err) => console.error("Service Worker failed:", err));
}

async function requestPermission(handle, mode = "read") {
  const descriptor = {
    handle: handle,
    mode: mode // "read" or "readwrite"
  };

  // Query current permission state
  const status = await handle.queryPermission(descriptor);
  if (status === "granted") return true;

  // Request permission if not already granted
  const result = await handle.requestPermission(descriptor);
  return result === "granted";
}

document.addEventListener("DOMContentLoaded", () => {
  const video = document.getElementById("player");
  const playBtn = document.getElementById("playBtn");
  const stopBtn = document.getElementById("stopBtn");
  const pickerBtn = document.getElementById("pickerBtn");
  const volumeSlider = document.getElementById("volumeSlider");
  const timeDisplay = document.getElementById("timeDisplay");
  const progressBar = document.getElementById("progressBar");
  const fullscreenBtn = document.getElementById("fullscreenBtn");

  playBtn.onclick = () => {
    if (video.readyState < 3 || !video.src) return;
    video.paused ? video.play() : video.pause();
    playBtn.textContent = video.paused ? "▶️" : "⏸️";
  };

  stopBtn.onclick = () => {
    video.pause();
    video.currentTime = 0;
    playBtn.textContent = "▶️";
  };

  pickerBtn.onclick = async (e) => {
    try {
        const [handle] = await window.showOpenFilePicker();

        const permission = await handle.requestPermission({ mode: "read" });
        if (permission === "granted") {
            const file = await handle.getFile();
            const url = URL.createObjectURL(file);
            video.src = url;
            video.play();
            playBtn.textContent = "⏸️";
            document.title = `▶️ ${file.name}`;
        }
    }
    catch (err) {
        console.warn("File picker cancelled or failed:", err);
        if (video.src && video.currentTime > 0) {
            stopBtn.onclick(); // Only stop if something's playing
        }
    }
  };
  volumeSlider.oninput = () => {
    video.volume = volumeSlider.value;
  };

  video.addEventListener("timeupdate", () => {
    const current = formatTime(video.currentTime);
    const total = formatTime(video.duration);
    timeDisplay.textContent = `${current} / ${total}`;
    progressBar.max = video.duration;
    progressBar.value = video.currentTime;
  });

fullscreenBtn.onclick = () => {
  const container = document.getElementById("playerContainer");
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    container.requestFullscreen();
  }
};

  progressBar.oninput = () => {
    video.currentTime = progressBar.value;
  };
document.addEventListener("keydown", (e) => {
  const video = document.getElementById("player");

  switch (e.code) {
    case "Enter":
    case "Space":
      togglePlay(video);
      e.preventDefault(); // prevent scroll or default behavior
      break;

    case "ArrowRight":
      if (video.readyState >= 3 && video.src) {
        video.currentTime = Math.min(video.duration, video.currentTime + 5);
      }
      break;

    case "ArrowLeft":
      if (video.readyState >= 3 && video.src) {
        video.currentTime = Math.max(0, video.currentTime - 5);
      }
      break;

    // optional: Esc to exit fullscreen
    case "Escape":
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
      break;
  }
});


    document.addEventListener("click", (e) => {
    const video = document.getElementById("player");
    const controls = document.getElementById("controls");
    if (!controls.contains(e.target)) {
        togglePlay(video);
    }
    });
  function formatTime(seconds) {
    const min = Math.floor(seconds / 60).toString().padStart(2, "0");
    const sec = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${min}:${sec}`;
  }
});

// Toggle play/pause logic
function togglePlay(video) {
  if (video.readyState < 3 || !video.src) return;
  video.paused ? video.play() : video.pause();
  document.getElementById("playBtn").textContent = video.paused ? "▶️" : "⏸️";
}

let hideTimeout;

function showControlsTemporarily() {
  controls.classList.remove("hidden");
  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    if (!isPointerInside(controls)) {
      controls.classList.add("hidden");
    }
  }, 3000); // Hide after 3 seconds
}

function isPointerInside(elem) {
  const rect = elem.getBoundingClientRect();
  const x = window.mouseX ?? -1;
  const y = window.mouseY ?? -1;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

// Track pointer location globally
document.addEventListener("mousemove", (e) => {
  window.mouseX = e.clientX;
  window.mouseY = e.clientY;
  showControlsTemporarily();
});

document.addEventListener("touchstart", (e) => {
  const touch = e.touches[0];
  if (touch) {
    window.mouseX = touch.clientX;
    window.mouseY = touch.clientY;
  }
  showControlsTemporarily();
});
