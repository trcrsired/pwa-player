// ===============================
// TikTok Platform
// ===============================

class TikTokPlatform extends BasePlatform {
    static get name() {
        return 'tiktok';
    }

    static get domains() {
        return [
            '*.tiktok.com',
            'tiktok.com',
            'vm.tiktok.com'  // Short URL domain
        ];
    }

    static extractVideoId(url) {
        if (!url) return null;

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            // vm.tiktok.com/xxxxxx (short URL)
            if (hostname === 'vm.tiktok.com' || hostname.endsWith('vm.tiktok.com')) {
                return urlObj.pathname.slice(1).split('?')[0];
            }

            // tiktok.com/@username/video/xxxxxx
            if (hostname.endsWith('tiktok.com')) {
                if (urlObj.pathname.includes('/video/')) {
                    const pathParts = urlObj.pathname.split('/');
                    const videoIndex = pathParts.indexOf('video');
                    if (videoIndex >= 0 && pathParts[videoIndex + 1]) {
                        return pathParts[videoIndex + 1]?.split('?')[0];
                    }
                }
            }
        } catch (e) {
            return null;
        }

        return null;
    }

    loadApi() {
        // TikTok doesn't have a proper iframe API
        this.apiReady = true;
    }

    createPlayer(contentInfo, container, options = {}) {

        // Get container element
        const containerEl = typeof container === 'string'
            ? document.getElementById(container)
            : container;

        if (!containerEl) return null;

        // Clear container
        containerEl.innerHTML = '';
        const videoId = contentInfo.videoId;
        this.currentVideoId = videoId;

        // TikTok embed URL format:
        // https://www.tiktok.com/embed/v2/VIDEO_ID
        // Note: TikTok's embed functionality is limited

        const embedSrc = `https://www.tiktok.com/embed/v2/${videoId}`;

        const iframe = document.createElement('iframe');
        iframe.src = embedSrc;
        iframe.setAttribute('allow', 'autoplay; fullscreen');
        iframe.setAttribute('allowfullscreen', 'true');
        iframe.setAttribute('playsinline', 'true');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.border = 'none';
        iframe.style.minHeight = '400px';
        iframe.id = 'tiktok-iframe';
        containerEl.appendChild(iframe);

        this.player = iframe;

        // Update title
        document.title = 'TikTok Video - PWA Player';
        navigator.mediaSession.metadata = new MediaMetadata({
            title: `TikTok: ${videoId}`,
            artist: 'TikTok',
            album: 'TikTok'
        });

        const titleEl = document.querySelector("#nowPlayingInfo .track-title");
        const artistEl = document.querySelector("#nowPlayingInfo .track-artist");
        const urlEl = document.querySelector("#nowPlayingInfo .track-url");
        if (titleEl) titleEl.textContent = `TikTok: ${videoId}`;
        if (artistEl) artistEl.textContent = 'TikTok';
        if (urlEl) urlEl.textContent = this.getVideoUrl(videoId);

        // Set play button state
        const playBtn = document.getElementById("playBtn");
        const npPlayBtn = document.getElementById("npPlayBtn");
        if (playBtn) playBtn.textContent = "⏸️";
        if (npPlayBtn) npPlayBtn.textContent = "⏸️";
        navigator.mediaSession.playbackState = 'playing';

        if (options.onReady) options.onReady();

        return this.player;
    }

    destroyPlayerInternal() {
        if (this.player && this.player.parentNode) {
            this.player.parentNode.removeChild(this.player);
        }
    }

    play() {
        // TikTok iframe doesn't support external control
    }

    pause() {
        // TikTok iframe doesn't support external control
    }

    togglePlayPause() {
        // Not supported
    }

    stop() {
        this.destroyPlayer();
    }

    seekToPercent(percent) {
        // Not supported
    }

    seekToTime(seconds) {
        // Not supported
    }

    setVolume(percent) {
        localStorage.setItem('volume', percent.toString());
    }

    getCurrentTime() {
        return 0;
    }

    getDuration() {
        return 0;
    }

    getTitle() {
        return `TikTok: ${this.currentVideoId}`;
    }

    getVideoUrl(videoId) {
        if (!videoId) return 'TikTok';
        // Format: tiktok.com/@username/video/xxxxxx - we don't have username
        return `https://www.tiktok.com/embed/v2/${videoId}`;
    }

    isPlaying() {
        return true;
    }
}

// Register TikTok platform
registerPlatform(TikTokPlatform);

// Legacy function names for backwards compatibility
window.extractTikTokVideoId = TikTokPlatform.extractVideoId;
window.isTikTokUrl = (url) => TikTokPlatform.isUrl(url);