// ===============================
// TikTok Platform
// ===============================

class TikTokPlatform extends PassiveEmbedPlatform {
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
        const videoId = contentInfo.videoId;
        this.currentVideoId = videoId;

        // TikTok embed URL format:
        // https://www.tiktok.com/embed/v2/VIDEO_ID
        // Note: TikTok's embed functionality is limited

        const embedSrc = `https://www.tiktok.com/embed/v2/${videoId}`;

        const iframe = this.mountEmbedIframe(container, {
            src: embedSrc,
            id: 'tiktok-iframe',
            allow: 'autoplay; fullscreen',
            allowFullscreen: true,
            playsInline: true,
            styles: { minHeight: '400px' }
        });
        if (!iframe) return null;

        // Update title
        this.applyEmbedNowPlaying({
            title: `TikTok: ${videoId}`,
            artist: 'TikTok',
            album: 'TikTok',
            url: this.getVideoUrl(videoId),
            documentTitle: 'TikTok Video - PWA Player'
        });

        if (options.onReady) options.onReady();

        return this.player;
    }

    getTitle() {
        return `TikTok: ${this.currentVideoId}`;
    }

    getVideoUrl(videoId) {
        if (!videoId) return 'TikTok';
        // Format: tiktok.com/@username/video/xxxxxx - we don't have username
        return `https://www.tiktok.com/embed/v2/${videoId}`;
    }

}

// Register TikTok platform
registerPlatform(TikTokPlatform);

// Legacy function names for backwards compatibility
window.extractTikTokVideoId = TikTokPlatform.extractVideoId;
window.isTikTokUrl = (url) => TikTokPlatform.isUrl(url);