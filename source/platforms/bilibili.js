// ===============================
// Bilibili Platform
// ===============================

class BilibiliPlatform extends PassiveEmbedPlatform {
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
        const videoId = contentInfo.videoId;
        this.currentVideoId = videoId;

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

        const iframe = this.mountEmbedIframe(container, {
            src: embedSrc,
            id: 'bilibili-iframe',
            allow: 'autoplay; fullscreen',
            allowFullscreen: true,
            playsInline: true
        });
        if (!iframe) return null;

        // Update title
        this.applyEmbedNowPlaying({
            title: `Bilibili: ${videoId}`,
            artist: 'Bilibili',
            album: 'Bilibili',
            url: this.getVideoUrl(videoId),
            documentTitle: 'Bilibili Video - PWA Player'
        });

        if (options.onReady) options.onReady();

        return this.player;
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