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

if ("launchQueue" in window) {
  launchQueue.setConsumer(async (launchParams) => {
    if (!launchParams.files || launchParams.files.length === 0) {
      document.title = "📂";
      return;
    }

    const video = document.getElementById("player");
    const playBtn = document.getElementById("playBtn");

    for (const handle of launchParams.files) {
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
  });
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
  const controls = document.getElementById("controls");

  playBtn.onclick = () => {
    if (!video.src)
    {
      pickerBtn.click();
      return;
    }
    if (video.readyState < 3) return;
    video.paused ? video.play() : video.pause();
    playBtn.textContent = video.paused ? "▶️" : "⏸️";
  };

  stopBtn.onclick = () => {
    video.pause();
    video.currentTime = 0;
    video.src = null;
    playBtn.textContent = "▶️";
  };

  function play_url(url)
  {
    controls.classList.toggle('hidden');
    video.src = url;
    video.play();
    playBtn.textContent = "⏸️";
  }

  pickerBtn.onclick = async (e) => {
    try {
        const [handle] = await window.showOpenFilePicker();

        const permission = await handle.requestPermission({ mode: "read" });
        if (permission === "granted") {
          const file = await handle.getFile();
          controls.classList.toggle('hidden');
          play_url(URL.createObjectURL(file));
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
  webBtn.onclick = () => {
    try {
      const url = prompt("Enter video URL:");

      if (url)
      {
        play_url(url);
      }
    }
    catch (err) {
        console.warn("web picker cancelled or failed:", err);
        if (video.src && video.currentTime > 0) {
            stopBtn.onclick(); // Only stop if something's playing
        }
    }
  };
  volumeSlider.oninput = () => {
    video.volume = volumeSlider.value;
  };

  video.addEventListener("timeupdate", () => {
    const duration = video.duration;
    if (!video.src || Number.isNaN(duration))
    {
      timeDisplay.textContent = "00:00 / 00:00";
      progressBar.max = 0;
      progressBar.value = 0;
      return;
    }
    const currentTime = video.currentTime;
    const current = formatTime(currentTime);
    const total = formatTime(duration);
    timeDisplay.textContent = `${current} / ${total}`;
    progressBar.max = duration;
    progressBar.value = currentTime;
  });

  fullscreenBtn.onclick = () => {
    const container = document.getElementById("playerContainer");
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
      controls.classList.toggle('hidden');
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
      case "KeyF":
        const container = document.getElementById("playerContainer");
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          container.requestFullscreen();
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
  }, 1000); // Hide after 1 seconds
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
  if (isPointerInside(controls))
  {
    showControlsTemporarily();
  }
});

let skipInterval = null;

document.getElementById("player").addEventListener("touchstart", (e) => {
  const video = e.target;
  const rect = video.getBoundingClientRect();
  const touch = e.touches[0];

  if (!touch || !video || video.readyState < 3 || !video.src) return;

  const x = touch.clientX - rect.left;
  const width = rect.width;

  if (x < width * 0.25) {
    // Left 25%: Start rewinding repeatedly
    skipInterval = setInterval(() => {
      video.currentTime = Math.max(0, video.currentTime - 30); // Rewind 30s per tick
    }, 300);
  } else if (x > width * 0.75) {
    // Right 25%: Start skipping forward repeatedly
    skipInterval = setInterval(() => {
      video.currentTime = Math.min(video.duration, video.currentTime + 30); // Skip 30s per tick
    }, 300);
  } else {
    // Center: Toggle play/pause once
    video.paused ? video.play() : video.pause();
    document.getElementById("playBtn").textContent = video.paused ? "▶️" : "⏸️";
  }
});

document.getElementById("player").addEventListener("touchend", () => {
  if (skipInterval) {
    clearInterval(skipInterval);
    skipInterval = null;
  }
});

document.getElementById("player").addEventListener("touchcancel", () => {
  if (skipInterval) {
    clearInterval(skipInterval);
    skipInterval = null;
  }
});
