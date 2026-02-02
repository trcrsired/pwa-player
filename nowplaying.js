let nowPlayingQueue = [];
let shuffledQueue = [];
let nowPlayingIndex = 0;

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

    if (!entry) {
        titleEl.textContent = "No track playing";
        artistEl.textContent = "";
        return;
    }

    // Basic metadata
    titleEl.textContent = entry.name || "Unknown Title";
    artistEl.textContent = entry.artist || "";
}

function renderNowPlayingQueue() {
    const ul = document.getElementById("nowPlayingQueue");
    ul.innerHTML = "";

    nowPlayingQueue.forEach((entry, i) => {
        const li = document.createElement("li");
        li.className = "list-item";

        // Highlight current track
        if (i === nowPlayingIndex) {
            li.classList.add("active");
        }

        li.textContent = entry.name || entry.path;

        // Clicking jumps to that track
        li.addEventListener("click", () => {
            nowPlaying_playIndex(i);
        });

        ul.appendChild(li);
    });
}
renderNowPlayingQueue()
async function nowPlaying_playIndex(index) {
    const entry = nowPlayingQueue[index];
    if (!entry) return;

    const resolved = await storage_resolvePath(entry.path);

    await play_source(resolved, {
        playlistName: entry.playlistName,
        index
    });

    nowPlayingIndex = index;

    // Update UI
    updateNowPlayingInfo(entry);
    renderNowPlayingQueue();
}

function showNowPlayingView() {
    updateNowPlayingInfo(nowPlayingQueue[nowPlayingIndex]);
    renderNowPlayingQueue();

    switchView("nowPlayingView");
}
