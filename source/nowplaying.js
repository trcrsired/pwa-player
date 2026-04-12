let nowPlayingQueue = [];
let shuffledQueue = [];
let nowPlayingIndex = 0;
let currentTrackEntry = null; // Store current track even when not playing from playlist

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
        entryPath: entry.path,
        entryName: entry.name,
        index,
    }, entry.corsBypass);

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

    // Use startIndex directly for ordered queue
    if (playMode !== "shuffle") {
        nowPlayingIndex = startIndex;
    } else {
        // In shuffle mode with startIndex=0, just play shuffledQueue[0]
        // Otherwise find the shuffled position of the requested item
        if (startIndex === 0) {
            nowPlayingIndex = 0;
        } else {
            const startEntry = nowPlayingQueue[startIndex];
            const foundIndex = shuffledQueue.findIndex(e => e.path === startEntry.path && e.playlistName === startEntry.playlistName);
            nowPlayingIndex = (foundIndex >= 0) ? foundIndex : 0;
        }
    }

    await nowPlaying_playIndex(nowPlayingIndex);
}

async function playPrevious() {
    if (nowPlayingQueue.length === 0) return;

    switch (playMode) {

        case "shuffle":
            // Go backwards in shuffled order
            if (--nowPlayingIndex < 0) {
                nowPlayingIndex = shuffledQueue.length - 1;
            }
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

// Get current play mode (for embedded player and other modules)
function getPlayMode() {
    return playMode;
}

// Get the currently playing track entry
function getCurrentTrack() {
    const queue = getActiveQueue();
    if (queue.length > 0 && queue[nowPlayingIndex]) {
        return queue[nowPlayingIndex];
    }
    // Return currentTrackEntry for single file/URL/IPTV plays
    return currentTrackEntry;
}

// Try to restore last playback state.
// Priority:
// 1. Now playing queue (if still has items after stop)
// 2. Last playlist (playlistName + index)
// 3. Last single file
// 4. Default playlist
// Returns true if something was restored and playback started.
async function restoreLastPlayback() {

    // Case 0: now playing queue still has items (after stop)
    const queue = getActiveQueue();
    if (queue.length > 0) {
        // Use current index, or reset to 0 if out of bounds
        if (nowPlayingIndex < 0 || nowPlayingIndex >= queue.length) {
            nowPlayingIndex = 0;
        }
        await nowPlaying_playIndex(nowPlayingIndex);
        return true;
    }

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

    // Case 3: play from default playlist
    const defaultPlaylist = localStorage.getItem("defaultPlaylist");
    if (defaultPlaylist) {
        const playlists = await playlists_load();
        const list = playlists[defaultPlaylist];
        if (list && list.length > 0) {
            await startNowPlayingFromPlaylist(defaultPlaylist, 0);
            return true;
        }
    }

    // Nothing to restore
    return false;
}


function updateNowPlayingInfo(entry) {
    // Store current track for access from other parts of the app
    currentTrackEntry = entry;

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
    const otherQueue = (playMode === "shuffle") ? nowPlayingQueue : shuffledQueue;
    const removed = queue.splice(index, 1)[0];

    // Keep the other queue in sync
    const otherIndex = otherQueue.indexOf(removed);
    if (otherIndex !== -1) otherQueue.splice(otherIndex, 1);

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

function confirmRemoveFromNowPlaying(index) {
    const queue = getActiveQueue();
    const entry = queue[index];

    const ok = confirm(`Remove "${entry.name || entry.path}" from the queue?`);
    if (!ok) return;

    removeFromNowPlaying(index);
}

function showNowPlayingItemMenu(index, button) {
    const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

    const menu = document.createElement("div");
    menu.className = "context-menu";

    menu.innerHTML = `
        <div class="menu-item" data-action="play">${t('playThis', 'Play')}</div>
        <div class="menu-item" data-action="play-keep-open">${t('playKeepPanel', 'Play (keep panel open)')}</div>
        <div class="menu-item danger" data-action="remove">${t('removeFromQueue', 'Remove from Queue')}</div>
        <div class="menu-item" data-action="properties">${t('properties', 'Properties')}</div>
        <div class="menu-item" data-action="close">${t('close', 'Close')}</div>
    `;

    if (!positionMenu(menu, button)) return;

    const closeMenu = () => menu.remove();

    menu.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", () => {
            const action = item.dataset.action;

            if (action === "play") {
                nowPlaying_playIndex(index);
                closeActiveView();
                closeMenu();
                return;
            }

            if (action === "play-keep-open") {
                nowPlaying_playIndex(index);
                closeMenu();
                return;
            }

            if (action === "remove") {
                confirmRemoveFromNowPlaying(index);
            }

            if (action === "properties") {
                const queue = getActiveQueue();
                const entry = queue[index];
                const info = [
                    `${t('index', 'Index')}: ${index + 1} / ${queue.length}`,
                    `${t('name', 'Name')}: ${entry?.name || 'N/A'}`,
                    `${t('path', 'Path')}: ${entry?.path || 'N/A'}`,
                    `${t('playlistName', 'Playlist')}: ${entry?.playlistName || 'N/A'}`
                ];
                alert(info.join('\n\n'));
                return;
            }

            closeMenu();
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

        // Track title with optional badges
        const titleSpan = document.createElement("span");
        titleSpan.className = "np-item-title";

        // Get badges using polymorphic platform method
        const badgesHtml = typeof getEntryBadgeHtml === 'function' ? getEntryBadgeHtml(entry) : '';

        titleSpan.innerHTML = `${escapeHTML(entry.name || entry.path)}${badgesHtml}`;

        // Click on title → play
        titleSpan.addEventListener("click", () => {
            nowPlaying_playIndex(i);
            if (typeof isAutoHidePanelEnabled === 'function' && isAutoHidePanelEnabled()) {
                closeActiveView();
            }
        });

        // Menu button (⋮)
        const menuBtn = document.createElement("button");
        menuBtn.className = "np-item-menu";
        menuBtn.textContent = "⋮";
        menuBtn.title = "Menu";
        menuBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            showNowPlayingItemMenu(i, e.currentTarget);
        });

        li.appendChild(titleSpan);
        li.appendChild(menuBtn);
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
            btn.textContent = "🔂";
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
            playNext();
            break;
    }
});


if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
  navigator.mediaSession.setActionHandler('nexttrack', playNext);
}