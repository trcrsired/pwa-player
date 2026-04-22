// ===============================
// Bilibili Platform
// ===============================

class BilibiliPlatform extends BasePlatform {
    static get name() {
        return 'bilibili';
    }

    static get domains() {
        return [
            '*.bilibili.com',
            'bilibili.com',
            '*.bilibili.tv',
            'bilibili.tv',
            'b23.tv'  // Short URL domain
        ];
    }

    static extractVideoId(url) {
        if (!url) return null;

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            // b23.tv/VIDEO_ID (short URL - BV ID)
            if (hostname === 'b23.tv') {
                console.log("29");
                // Could be BVxxxxxx or just path
                return urlObj.pathname.slice(1).split('?')[0];
            }
            console.log("33");

            // bilibili.com/video/BVxxxxxx or bilibili.com/video/avxxxxxx
            if (hostname.endsWith('bilibili.com') || hostname.endsWith('bilibili.tv')) {
                if (urlObj.pathname.startsWith('/video/')) {
                    // Extract BV or AV ID
                    const pathParts = urlObj.pathname.slice(7).split('/');
                    const videoId = pathParts[0]?.split('?')[0];
                    console.log("40");
                    // Handle BV IDs (base64-like) and AV IDs (numeric with av prefix)
                    if (videoId && (videoId.startsWith('BV') || videoId.startsWith('av'))) {
                        console.log("44here", videoId);
                        return videoId;
                    }
                    console.log("47",videoId);
                    return videoId;
                }
            }
        } catch (e) {
            return null;
        }

        return null;
    }

    loadApi() {
        // Bilibili doesn't have a proper iframe API like YouTube
        // We use a direct iframe embed approach
        this.apiReady = true;
    }

    createPlayer(contentInfo, container, options = {}) {


        // Get container element
        const containerEl = typeof container === 'string'
            ? document.getElementById(container)
            : container;

        if (!containerEl) return null;

        const videoId = contentInfo.videoId;
        this.currentVideoId = videoId;

        // Clear container
        containerEl.innerHTML = '';

        // Check play mode for looping
        const playMode = typeof getPlayMode === 'function' ? getPlayMode() : 'once';
        const shouldLoop = playMode === 'repeat-one';

        // Create iframe
        // Bilibili embed URL format: https://player.bilibili.com/player.html?bvid=BVxxxxxx
        // or for AV IDs: https://player.bilibili.com/player.html?aid=xxxxxx

        let embedSrc;
        if (videoId.startsWith('BV')) {
            embedSrc = `https://player.bilibili.com/player.html?bvid=${videoId}&autoplay=1&high_quality=1&danmaku=0`;
        } else if (videoId.startsWith('av')) {
            const aid = videoId.slice(2); // Remove 'av' prefix
            embedSrc = `https://player.bilibili.com/player.html?aid=${aid}&autoplay=1&high_quality=1&danmaku=0`;
        } else {
            // Try as bvid
            embedSrc = `https://player.bilibili.com/player.html?bvid=${videoId}&autoplay=1&high_quality=1&danmaku=0`;
        }

        if (shouldLoop) {
            embedSrc += '&loop=1';
        }

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
        iframe.id = 'bilibili-iframe';
        containerEl.appendChild(iframe);

        this.player = iframe;

        // Update title
        document.title = 'Bilibili Video - PWA Player';
        navigator.mediaSession.metadata = new MediaMetadata({
            title: `Bilibili: ${videoId}`,
            artist: 'Bilibili',
            album: 'Bilibili'
        });

        const titleEl = document.querySelector("#nowPlayingInfo .track-title");
        const artistEl = document.querySelector("#nowPlayingInfo .track-artist");
        const urlEl = document.querySelector("#nowPlayingInfo .track-url");
        if (titleEl) titleEl.textContent = `Bilibili: ${videoId}`;
        if (artistEl) artistEl.textContent = 'Bilibili';
        if (urlEl) urlEl.textContent = this.getVideoUrl(videoId);

        // Note: Bilibili iframe doesn't provide API for progress/controls
        // User needs to use Bilibili's own controls

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
        if (this.player) {
            // Just remove the iframe
            if (this.player.parentNode) {
                this.player.parentNode.removeChild(this.player);
            }
        }
    }

    play() {
        // Bilibili iframe doesn't support external play control
        console.log('Bilibili: Use iframe controls to play');
    }

    pause() {
        // Bilibili iframe doesn't support external pause control
        console.log('Bilibili: Use iframe controls to pause');
    }

    togglePlayPause() {
        // Bilibili iframe doesn't support external toggle
        console.log('Bilibili: Use iframe controls to toggle play/pause');
    }

    stop() {
        this.destroyPlayer();
    }

    seekToPercent(percent) {
        // Bilibili iframe doesn't support external seek
        console.log('Bilibili: Use iframe controls to seek');
    }

    seekToTime(seconds) {
        // Bilibili iframe doesn't support external seek
        console.log('Bilibili: Use iframe controls to seek');
    }

    setVolume(percent) {
        // Bilibili iframe doesn't support external volume
        localStorage.setItem('volume', percent.toString());
        console.log('Bilibili: Use iframe controls to adjust volume');
    }

    getCurrentTime() {
        return 0; // Not available via iframe
    }

    getDuration() {
        return 0; // Not available via iframe
    }

    getTitle() {
        return `Bilibili: ${this.currentVideoId}`;
    }

    getVideoUrl(videoId) {
        if (!videoId) return 'Bilibili';
        if (videoId.startsWith('BV')) {
            return `https://www.bilibili.com/video/${videoId}`;
        } else if (videoId.startsWith('av')) {
            return `https://www.bilibili.com/video/${videoId}`;
        }
        return `https://www.bilibili.com/video/${videoId}`;
    }

    isPlaying() {
        return true; // Assume playing after create
    }

    // Override handleVideoEnded since we can't control the player
    handleVideoEnded() {
        // Can't detect video ended reliably with iframe
        return false;
    }
}

// Register Bilibili platform
registerPlatform(BilibiliPlatform);

// Legacy function names for backwards compatibility
window.extractBilibiliVideoId = BilibiliPlatform.extractVideoId;
window.isBilibiliUrl = (url) => BilibiliPlatform.isUrl(url);