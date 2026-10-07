// ===============================
// Side Panel — floating edge rail + slide-over sheets
// ===============================
// A thin trigger zone on the left or right screen edge reveals a
// floating rail of shortcuts (Now Playing / Playlists / Storage /
// IPTV / Settings). Selecting one opens that view as a slide-over
// sheet on the same edge instead of replacing the player, so it
// also works on top of embedded players (YouTube, Spotify, ...).
// While an embedded site is active an extra "back to player"
// button appears, giving a way out without refreshing the page.
//
// The dock buttons in the control bar still open full-page views.

const sideEdgeTrigger = document.getElementById("sideEdgeTrigger");
const sideRail = document.getElementById("sideRail");
const sideRailHandle = document.getElementById("sideRailHandle");
const sideRailPlayerBtn = document.getElementById("sideRailPlayerBtn");
const sideRailSep = document.getElementById("sideRailSep");

// On touch devices the OS back gesture owns edge swipes, so the rail is
// opened via the visible handle instead of the invisible edge zone.
const coarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

const SIDE_SHEET_CLOSE_MS = 320;
const RAIL_AUTOHIDE_MS = 4500;

let sidePanelViewId = null;
let railHideTimer = null;
let railAutoHideTimer = null;
let edgeSwipe = null;
let sheetSwipe = null;

function getSidePanelView() {
    return sidePanelViewId;
}

function getSidePanelSide() {
    const pos = (typeof getSidePanelPosition === "function")
        ? getSidePanelPosition()
        : (localStorage.getItem("sidePanelPosition") || "left");
    return pos === "right" ? "right" : (pos === "off" ? "off" : "left");
}

// Apply the configured side to body classes, trigger visibility,
// and any currently open sheet.
function applySidePanelPosition() {
    const side = getSidePanelSide();
    document.body.classList.toggle("side-left", side === "left");
    document.body.classList.toggle("side-right", side === "right");

    if (side === "off") {
        hideSideRail();
        closeSidePanel(true);
        if (sideEdgeTrigger) sideEdgeTrigger.classList.add("hidden");
        return;
    }
    if (sideEdgeTrigger) sideEdgeTrigger.classList.remove("hidden");

    // Re-dock an open sheet to the new edge
    if (sidePanelViewId) {
        const view = document.getElementById(sidePanelViewId);
        if (view) {
            view.classList.toggle("sheet-left", side === "left");
            view.classList.toggle("sheet-right", side === "right");
            setSheetBackIcon(view, side);
        }
    }
}

// Point the sheet's back button toward its docked edge
function setSheetBackIcon(view, side) {
    const backBtn = view.querySelector(".back-btn");
    if (backBtn && typeof setIcon === "function") {
        setIcon(backBtn, side === "right" ? "chevronRight" : "back");
    }
}

// ---------- rail show / hide ----------

function showSideRail() {
    if (!sideRail || getSidePanelSide() === "off") return;
    clearTimeout(railHideTimer);
    clearTimeout(railAutoHideTimer);

    // The embedded escape hatch only exists while a site is playing
    const embeddedActive = typeof isEmbeddedPlayerActive === "function" && isEmbeddedPlayerActive();
    if (sideRailPlayerBtn) sideRailPlayerBtn.classList.toggle("hidden", !embeddedActive);
    if (sideRailSep) sideRailSep.classList.toggle("hidden", !embeddedActive);

    // Highlight the icon of the currently open sheet
    sideRail.querySelectorAll("[data-sidepanel]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.sidepanel === sidePanelViewId);
    });

    sideRail.classList.remove("hidden");
    document.body.classList.add("rail-shown");
    requestAnimationFrame(() => requestAnimationFrame(() => {
        sideRail.classList.add("rail-visible");
    }));

    if (!coarsePointer) {
        railAutoHideTimer = setTimeout(hideSideRail, RAIL_AUTOHIDE_MS);
    }
}

function hideSideRail() {
    clearTimeout(railHideTimer);
    clearTimeout(railAutoHideTimer);
    document.body.classList.remove("rail-shown");
    if (!sideRail || sideRail.classList.contains("hidden")) return;
    sideRail.classList.remove("rail-visible");
    railHideTimer = setTimeout(() => sideRail.classList.add("hidden"), 300);
}

function scheduleRailHide(delay = 400) {
    clearTimeout(railHideTimer);
    clearTimeout(railAutoHideTimer);
    railHideTimer = setTimeout(hideSideRail, delay);
}

// ---------- slide-over sheets ----------

function openSidePanel(viewId, fromPopstate = false) {
    const view = document.getElementById(viewId);
    if (!view) return;

    // Rail disabled — fall back to the classic full-page view
    if (getSidePanelSide() === "off") {
        switchView(viewId);
        return;
    }

    // Tapping the same rail icon again closes the sheet
    if (sidePanelViewId === viewId) {
        closeSidePanel();
        return;
    }

    // Already open as a full-page view — leave it alone
    if (!view.classList.contains("hidden") && !view.classList.contains("side-sheet")) {
        hideSideRail();
        return;
    }

    closeSidePanel(true, true); // instant + skip history juggling
    hideSideRail();

    const side = getSidePanelSide();
    view.classList.remove("hidden", "sheet-closing", "sheet-left", "sheet-right");
    view.style.transform = "";
    view.style.transition = "";
    view.classList.add("side-sheet", `sheet-${side}`);
    setSheetBackIcon(view, side);
    requestAnimationFrame(() => requestAnimationFrame(() => {
        view.classList.add("sheet-visible");
    }));
    sidePanelViewId = viewId;
    document.body.classList.add("sheet-open");
    if (sideRail) {
        sideRail.querySelectorAll("[data-sidepanel]").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.sidepanel === viewId);
        });
    }

    if (!fromPopstate) {
        // Switching between sheets replaces the current entry so a
        // single back press still lands on the previous state.
        if (history.state && history.state.sidePanel) {
            history.replaceState({ sidePanel: viewId }, "", location.href);
        } else {
            history.pushState({ sidePanel: viewId }, "", location.href);
        }
    }

    // Per-view refresh hooks, matching what the dock buttons do
    if (viewId === "nowPlayingView" && typeof renderNowPlayingQueue === "function") {
        renderNowPlayingQueue();
    }
    if (viewId === "settingsView" && typeof updateSaveLocationsDisplay === "function") {
        setTimeout(updateSaveLocationsDisplay, 100);
    }

    if (typeof controls !== "undefined" && typeof updateSubtitlePosition === "function") {
        updateSubtitlePosition(!controls.classList.contains("hidden"));
    }
    if (typeof window.updateScrollButtons === "function") {
        setTimeout(window.updateScrollButtons, 50);
        setTimeout(window.updateScrollButtons, 300);
    }
}

// Returns true if a sheet was open and got closed.
function closeSidePanel(instant = false, fromPopstate = false) {
    if (!sidePanelViewId) return false;
    const view = document.getElementById(sidePanelViewId);
    const closingId = sidePanelViewId;
    sidePanelViewId = null;
    document.body.classList.remove("sheet-open");

    if (view) {
        if (typeof saveViewScrollPosition === "function") {
            saveViewScrollPosition(view);
        }
        const backBtn = view.querySelector(".back-btn");
        if (backBtn && typeof setIcon === "function") setIcon(backBtn, "back");

        if (instant) {
            view.classList.add("hidden");
            view.classList.remove("side-sheet", "sheet-left", "sheet-right", "sheet-visible", "sheet-closing");
            view.style.transform = "";
            view.style.transition = "";
        } else {
            view.classList.add("sheet-closing");
            view.classList.remove("sheet-visible");
            view.style.transform = "";
            view.style.transition = "";
            setTimeout(() => {
                // Skip if the sheet was reopened meanwhile
                if (sidePanelViewId === closingId || !view.classList.contains("sheet-closing")) return;
                view.classList.add("hidden");
                view.classList.remove("side-sheet", "sheet-left", "sheet-right", "sheet-closing");
            }, SIDE_SHEET_CLOSE_MS);
        }
    }

    // Pop the history entry this sheet pushed (unless we're already
    // inside popstate handling or another sheet replaced the state)
    if (!fromPopstate && history.state && history.state.sidePanel === closingId) {
        history.back();
    }

    if (typeof window.updateScrollButtons === "function") {
        setTimeout(window.updateScrollButtons, SIDE_SHEET_CLOSE_MS);
    }
    return true;
}

// ---------- trigger + rail wiring ----------

if (sideEdgeTrigger) {
    sideEdgeTrigger.addEventListener("mouseenter", showSideRail);
    sideEdgeTrigger.addEventListener("mouseleave", () => scheduleRailHide());
    sideEdgeTrigger.addEventListener("touchstart", (e) => {
        e.preventDefault();
        showSideRail();
    }, { passive: false });
}

if (sideRail) {
    sideRail.addEventListener("mouseenter", () => {
        clearTimeout(railHideTimer);
        clearTimeout(railAutoHideTimer);
    });
    sideRail.addEventListener("mouseleave", () => scheduleRailHide());

    sideRail.querySelectorAll("[data-sidepanel]").forEach(btn => {
        btn.addEventListener("click", () => openSidePanel(btn.dataset.sidepanel));
    });
}

if (sideRailPlayerBtn) {
    sideRailPlayerBtn.addEventListener("click", () => {
        closeSidePanel(true, true);
        if (typeof stopEmbeddedPlayer === "function") stopEmbeddedPlayer();
        hideSideRail();
    });
}

// Visible edge handle (touch devices): tap toggles the rail, dragging it
// inward opens it. A drag-open must swallow the trailing click or it
// would immediately toggle the rail back shut.
let handleDragSuppressClick = false;
if (sideRailHandle) {
    let handleStart = null;
    sideRailHandle.addEventListener("pointerdown", (e) => {
        handleStart = { x: e.clientX, y: e.clientY };
        handleDragSuppressClick = false;
        try { sideRailHandle.setPointerCapture(e.pointerId); } catch (_) {}
    });
    sideRailHandle.addEventListener("pointermove", (e) => {
        if (!handleStart) return;
        const side = getSidePanelSide();
        const inward = side === "right" ? handleStart.x - e.clientX : e.clientX - handleStart.x;
        if (inward > 16) {
            handleStart = null;
            handleDragSuppressClick = true;
            showSideRail();
        }
    });
    ["pointerup", "pointercancel"].forEach(ev =>
        sideRailHandle.addEventListener(ev, () => { handleStart = null; }));
    sideRailHandle.addEventListener("click", () => {
        if (handleDragSuppressClick) {
            handleDragSuppressClick = false;
            return;
        }
        if (sideRail && sideRail.classList.contains("rail-visible")) {
            hideSideRail();
        } else {
            showSideRail();
        }
    });
}

// Pointerdown outside the sheet dismisses it (Esc and the sheet's back
// button also close it). Clicks inside an embedded iframe never reach
// us, so over embedded content the rail/back button remain the way out.
document.addEventListener("pointerdown", (e) => {
    if (!sidePanelViewId) return;
    const view = document.getElementById(sidePanelViewId);
    if (!view || view.contains(e.target)) return;
    if (sideRail && sideRail.contains(e.target)) return;
    if (sideRailHandle && sideRailHandle.contains(e.target)) return;
    if (sideEdgeTrigger && sideEdgeTrigger.contains(e.target)) return;
    if (e.target.closest && e.target.closest(".context-menu")) return;
    if (e.target.closest && e.target.closest(".scroll-btn")) return;
    closeSidePanel();
});

// Tapping anywhere outside a visible rail retracts it (the rail also
// auto-hides after a few seconds; on desktop hover-leave hides it).
document.addEventListener("pointerdown", (e) => {
    if (!sideRail || !sideRail.classList.contains("rail-visible")) return;
    if (sideRail.contains(e.target)) return;
    if (sideRailHandle && sideRailHandle.contains(e.target)) return;
    if (sideEdgeTrigger && sideEdgeTrigger.contains(e.target)) return;
    hideSideRail();
});

// ---------- touch gestures ----------

// Edge swipe reveals the rail (fine pointers only — on touch devices the
// OS back gesture claims edge swipes, so the handle is the opener there)
document.addEventListener("touchstart", (e) => {
    edgeSwipe = null;
    if (coarsePointer) return;
    if (e.touches.length !== 1) return;
    const side = getSidePanelSide();
    if (side === "off") return;
    const t = e.touches[0];
    const EDGE = 28;
    if (side === "left" && t.clientX <= EDGE) {
        edgeSwipe = { x: t.clientX, y: t.clientY };
    } else if (side === "right" && t.clientX >= window.innerWidth - EDGE) {
        edgeSwipe = { x: t.clientX, y: t.clientY };
    }
}, { passive: true });

document.addEventListener("touchmove", (e) => {
    if (!edgeSwipe) return;
    const t = e.touches[0];
    const dx = t.clientX - edgeSwipe.x;
    const dy = t.clientY - edgeSwipe.y;
    const inward = getSidePanelSide() === "right" ? -dx : dx;
    if (inward > 24 && inward > Math.abs(dy) * 1.2) {
        showSideRail();
        edgeSwipe = null;
    } else if (Math.abs(dy) > 40 || inward < -20) {
        edgeSwipe = null;
    }
}, { passive: true });

document.addEventListener("touchend", () => { edgeSwipe = null; }, { passive: true });
document.addEventListener("touchcancel", () => { edgeSwipe = null; }, { passive: true });

// Dragging a sheet back toward its docked edge closes it
document.addEventListener("touchstart", (e) => {
    sheetSwipe = null;
    if (!sidePanelViewId || e.touches.length !== 1) return;
    const view = document.getElementById(sidePanelViewId);
    if (!view || !view.contains(e.target)) return;
    const t = e.touches[0];
    sheetSwipe = { x: t.clientX, y: t.clientY, view, side: getSidePanelSide(), dragging: false };
}, { passive: true });

document.addEventListener("touchmove", (e) => {
    if (!sheetSwipe) return;
    const t = e.touches[0];
    const dx = t.clientX - sheetSwipe.x;
    const dy = t.clientY - sheetSwipe.y;
    const outward = sheetSwipe.side === "right" ? dx : -dx;

    if (!sheetSwipe.dragging) {
        if (outward > 10 && outward > Math.abs(dy) * 1.3) {
            sheetSwipe.dragging = true;
        } else if (Math.abs(dy) > 10) {
            sheetSwipe = null; // vertical scroll wins
            return;
        } else {
            return;
        }
    }
    e.preventDefault();
    const offset = Math.max(0, outward);
    sheetSwipe.view.style.transition = "none";
    sheetSwipe.view.style.transform =
        `translateX(${sheetSwipe.side === "right" ? offset : -offset}px)`;
}, { passive: false });

function finishSheetSwipe(e) {
    if (!sheetSwipe) return;
    const s = sheetSwipe;
    sheetSwipe = null;
    if (!s.dragging) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const outward = s.side === "right" ? dx : -dx;
    s.view.style.transition = "";
    s.view.style.transform = "";
    if (outward > Math.min(140, s.view.offsetWidth * 0.35)) {
        closeSidePanel();
    }
}
document.addEventListener("touchend", finishSheetSwipe, { passive: true });
document.addEventListener("touchcancel", finishSheetSwipe, { passive: true });

// ---------- integration hooks ----------

// Scroll buttons should skip sheets that are mid-close animation
window.getActiveOverlayView = function () {
    const views = document.querySelectorAll(".overlay-view");
    for (const view of views) {
        if (!view.classList.contains("hidden") && !view.classList.contains("sheet-closing")) {
            return view;
        }
    }
    return null;
};

// Expose for player.js navigation code
window.openSidePanel = openSidePanel;
window.closeSidePanel = closeSidePanel;
window.getSidePanelView = getSidePanelView;
window.applySidePanelPosition = applySidePanelPosition;

applySidePanelPosition();
