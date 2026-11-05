/* Shared helpers used by several views.
 *
 * Loaded first (see index.html) so every other script can rely on these being
 * global. Keep this file tiny: it is the single home for the little snippets
 * that used to be copy-pasted into player/storage/playlist/settings/iptv.
 */
(function () {
    "use strict";

    /* ---- toast ------------------------------------------------------- */

    let toastTimer = null;

    // One toast for the whole app (the element lives in index.html and is
    // styled with .show). `duration` in ms; 0 keeps it until hideToast().
    function showToast(message, duration = 2000) {
        const toast = document.getElementById("toast");
        if (!toast) return;

        toast.textContent = message;
        toast.classList.add("show");

        if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = null;
        }
        if (duration > 0) {
            toastTimer = setTimeout(() => {
                toastTimer = null;
                toast.classList.remove("show");
            }, duration);
        }
    }

    function hideToast() {
        const toast = document.getElementById("toast");
        if (!toast) return;
        if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = null;
        }
        toast.classList.remove("show");
    }

    /* ---- html ------------------------------------------------------- */

    // Non-strings become "" (callers pass optional names/paths).
    function escapeHTML(value) {
        if (typeof value !== "string") return "";
        return value.replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[c]));
    }

    /* ---- sharing ---------------------------------------------------- */

    // Text to share/copy: the caller's text plus this app's URL when the
    // "Include PWA Player URL when sharing" setting is on.
    function buildShareText(baseText) {
        if (typeof isSharePwaPlayerUrlEnabled === "function" && isSharePwaPlayerUrlEnabled()) {
            const pwaUrl = typeof getPwaPlayerUrl === "function" ? getPwaPlayerUrl() : window.location.href;
            return `${baseText}\n\nPWA Player: ${pwaUrl}`;
        }
        return baseText;
    }

    // Share through the Web Share API, falling back to the clipboard.
    // Returns "shared" | "copied" | "failed".
    async function shareOrCopy({ title, text, url, copiedMessage }) {
        const shareText = buildShareText(text || title || "");
        const t = window.i18n ? window.i18n.t.bind(window.i18n) : (k) => k;

        if (navigator.share && !url) {
            try {
                await navigator.share({ title: title || shareText, text: shareText });
                return "shared";
            } catch (e) {
                if (e && e.name === "AbortError") return "shared";
                console.warn("Share failed, copying instead:", e);
            }
        } else if (navigator.share && url) {
            try {
                await navigator.share({ title: title || url, text: shareText, url });
                return "shared";
            } catch (e) {
                if (e && e.name === "AbortError") return "shared";
                console.warn("Share failed, copying instead:", e);
            }
        }

        try {
            await navigator.clipboard.writeText(url || shareText);
            showToast(copiedMessage || t("copied", "Copied"));
            return "copied";
        } catch (e) {
            console.warn("Copy failed:", e);
            return "failed";
        }
    }

    window.showToast = showToast;
    window.hideToast = hideToast;
    window.escapeHTML = escapeHTML;
    window.buildShareText = buildShareText;
    window.shareOrCopy = shareOrCopy;
})();
