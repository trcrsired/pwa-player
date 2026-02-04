let nowPlayingQueue = [];
let shuffledQueue = [];
let nowPlayingIndex = 0;

// Playback modes
const PLAY_MODES = ["once", "repeat", "repeat-one", "shuffle"];

// Default mode is Shuffle
let playMode = "shuffle";

function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; --i) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

async function nowPlaying_playIndex(index) {
    const entry = (playMode === "shuffle")
        ? shuffledQueue[index]
        : nowPlayingQueue[index];

    if (!entry) return;

    const resolved = await storage_resolvePath(entry.path);

    await play_source(resolved, {
        playlistName: entry.playlistName,
        index
    });

    nowPlayingIndex = index;
    renderNowPlayingQueue();
}

async function startNowPlayingFromPlaylist(playlistName, startIndex) {
    const playlists = await playlists_load();
    const list = playlists[playlistName];
    if (!list) return;

    nowPlayingQueue = list.map(item => ({
        ...item,
        playlistName
    }));

    // Build shuffled queue
    shuffledQueue = shuffleArray(nowPlayingQueue);

    // Find the shuffled index corresponding to startIndex
    const startEntry = nowPlayingQueue[startIndex];
    nowPlayingIndex = shuffledQueue.findIndex(e => e.path === startEntry.path);

    await nowPlaying_playIndex(nowPlayingIndex);
}

async function playPrevious() {
    if (nowPlayingQueue.length === 0) return;

    switch (playMode) {

        case "shuffle":
            let prev;
            if (nowPlayingQueue.length === 1) {
                prev = nowPlayingIndex;
            } else {
                do {
                    prev = Math.floor(Math.random() * nowPlayingQueue.length);
                } while (prev === nowPlayingIndex);
            }
            nowPlayingIndex = prev;
            break;

        case "repeat-one":
            // Stay on same track
            break;

        case "repeat":
            if (--nowPlayingIndex < 0) {
                nowPlayingIndex = nowPlayingQueue.length - 1;
            }
            break;

        case "once":
            if (--nowPlayingIndex < 0) {
                return; // stop playback
            }
            break;
    }

    await nowPlaying_playIndex(nowPlayingIndex);
}


async function playNext() {
    if (nowPlayingQueue.length === 0) return;

    switch (playMode) {

        case "shuffle":
            // Move to next in shuffled order
            if (++nowPlayingIndex >= shuffledQueue.length) {
                // End of round → reshuffle
                shuffledQueue = shuffleArray(nowPlayingQueue);
                nowPlayingIndex = 0;
            }
            break;

        case "repeat-one":
            // Stay on same index
            break;

        case "repeat":
            if (++nowPlayingIndex >= nowPlayingQueue.length) {
                nowPlayingIndex = 0;
            }
            break;

        case "once":
            if (++nowPlayingIndex >= nowPlayingQueue.length) {
                return;
            }
            break;
    }

    await nowPlaying_playIndex(nowPlayingIndex);
}

document.getElementById("prevBtn").addEventListener("click", playPrevious);
document.getElementById("npPrevBtn").addEventListener("click", playPrevious);

document.getElementById("nextBtn").addEventListener("click", playNext);
document.getElementById("npNextBtn").addEventListener("click", playNext);

function getActiveQueue() {
    return playMode === "shuffle" ? shuffledQueue : nowPlayingQueue;
}

// Try to restore last playback state.
// Priority:
// 1. Last playlist (playlistName + index)
// 2. Last single file
// Returns true if something was restored and playback started.
async function restoreLastPlayback() {

    // Case 1: restore last playlist
    const lastplaylist = await kv_get("lastplaylist");
    if (lastplaylist) {
        const { playlistName, index } = lastplaylist;

        // Start playing the playlist from saved index
        await startNowPlayingFromPlaylist(playlistName, index);
        return true;
    }

    // Case 2: restore last single file
    const lastplayed = await kv_get("lastplayed");
    if (lastplayed) {
        play_source(lastplayed).catch(() => {});
        return true;
    }

    // Nothing to restore
    return false;
}


function updateNowPlayingInfo(entry) {
    const titleEl = document.querySelector("#nowPlayingInfo .track-title");
    const artistEl = document.querySelector("#nowPlayingInfo .track-artist");
    const urlEl = document.querySelector("#nowPlayingInfo .track-url");

    if (!entry) {
        titleEl.textContent = "No track playing";
        artistEl.textContent = "";
        urlEl.textContent = "";
        return;
    }

    // Basic metadata
    titleEl.textContent = entry.name || "Unknown Title";
    artistEl.textContent = entry.artist || "";
    urlEl.textContent = entry.path || "";
}

function removeFromNowPlaying(index) {
    const queue = getActiveQueue();

    // Remove the selected item
    queue.splice(index, 1);

    // If the removed item is the currently playing one
    if (index === nowPlayingIndex) {

        // If queue becomes empty
        if (queue.length === 0) {
            video.pause();
            nowPlayingIndex = -1;
            updateNowPlayingInfo(null);
            renderNowPlayingQueue();
            return;
        }

        // Play the next available item
        const nextIndex = Math.min(index, queue.length - 1);
        nowPlaying_playIndex(nextIndex);

    } else if (index < nowPlayingIndex) {
        // If an earlier item was removed, shift current index left
        --nowPlayingIndex;
    }

    // Refresh UI
    renderNowPlayingQueue();
}

function positionContextMenu(menu, x, y) {
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x;
    let top = y;

    // Prefer right side, flip left if overflowing
    if (left + menuWidth > viewportWidth) {
        left = x - menuWidth;
        if (left < 0) left = 0;
    }

    // Prefer below, flip above if overflowing
    if (top + menuHeight > viewportHeight) {
        top = y - menuHeight;
        if (top < 0) top = 0;
    }

    menu.style.left = left + "px";
    menu.style.top = top + "px";
}

function closeContextMenu() {
    const existing = document.querySelector(".context-menu");
    if (existing) existing.remove();
}

function enableContextMenuAutoClose(menu) {
    const handler = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener("mousedown", handler);
            document.removeEventListener("touchstart", handler);
        }
    };

    // Use mousedown/touchstart so it closes BEFORE new menus open
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
}

function confirmRemoveFromNowPlaying(index) {
    const queue = getActiveQueue();
    const entry = queue[index];

    const ok = confirm(`Remove "${entry.name || entry.path}" from the queue?`);
    if (!ok) return;

    removeFromNowPlaying(index);
}

function showNowPlayingItemMenu(index, x, y) {
    closeContextMenu();

    const menu = document.createElement("div");
    menu.className = "context-menu";

    menu.innerHTML = `
        <div class="menu-item danger" data-action="remove">Remove from Queue</div>
        <div class="menu-item" data-action="close">Close</div>
    `;

    // Step 1: append BEFORE measuring
    document.body.appendChild(menu);

    // Step 2: force layout (important!)
    menu.getBoundingClientRect();

    // Step 3: now position correctly
    positionContextMenu(menu, x, y);

    enableContextMenuAutoClose(menu);

    menu.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", () => {
            const action = item.dataset.action;

            if (action === "remove") {
                confirmRemoveFromNowPlaying(index);
            }

            closeContextMenu();
        });
    });
}


function renderNowPlayingQueue() {
    const ul = document.getElementById("nowPlayingQueue");
    ul.innerHTML = "";

    const queue = getActiveQueue();

    queue.forEach((entry, i) => {
        const li = document.createElement("li");
        li.className = "list-item";

        // Highlight current track
        if (i === nowPlayingIndex) {
            li.classList.add("active");
        }

        // Display track name only
        li.innerHTML = `
            <span class="np-item-title">${entry.name || entry.path}</span>
        `;

        // Left-click → play
        li.addEventListener("click", () => {
            nowPlaying_playIndex(i);
        });

        // Right-click → context menu
        li.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            console.log("RIGHT CLICK WORKS", i);
            showNowPlayingItemMenu(i, e.pageX, e.pageY);
        });

        ul.appendChild(li);
    });
}

// Update button text
function updatePlayModeButton() {
    const btn = document.getElementById("playModeBtn");

    switch (playMode) {
        case "once":
            btn.textContent = "➡️";
            break;
        case "repeat":
            btn.textContent = "🔁";
            break;
        case "repeat-one":
            btn.textContent = "🔂1";
            break;
        case "shuffle":
            btn.textContent = "🔀";
            break;
    }
    document.getElementById("npPlayModeBtn").textContent = btn.textContent;
}

async function loadPlayMode() {
    const saved = await kv_get("playMode");
    if (saved && PLAY_MODES.includes(saved)) {
        playMode = saved;
    } else {
        playMode = "shuffle"; // default
    }
    updatePlayModeButton();
    return playMode;
}

// Cycle playback mode

function clickPlayModeBtn()
{
    const index = PLAY_MODES.indexOf(playMode);
    playMode = PLAY_MODES[(index + 1) % PLAY_MODES.length];
    kv_set("playMode", playMode);

    updatePlayModeButton();
}

document.getElementById("playModeBtn").addEventListener("click", clickPlayModeBtn);
document.getElementById("npPlayModeBtn").addEventListener("click", clickPlayModeBtn);

loadPlayMode();

function showNowPlayingView() {
    renderNowPlayingQueue();

    switchView("nowPlayingView");
}

document.getElementById("player").addEventListener("ended", () => {
    switch (playMode) {
        case "once":
            // Do nothing
            break;

        case "repeat-one":
            video.currentTime = 0;
            video.play();
            break;

        case "repeat":
        case "shuffle":
            // Placeholder: will call playNext() later
            playNext();
            break;
    }
});


if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
  navigator.mediaSession.setActionHandler('nexttrack', playNext);
}