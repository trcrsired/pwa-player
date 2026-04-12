// ===============================
// Douyin Platform (抖音)
// ===============================

class DouyinPlatform extends BasePlatform {
    static get name() {
        return 'douyin';
    }

    static get domains() {
        return [
            '*.douyin.com',
            'douyin.com',
            '*.iesdouyin.com',
            'iesdouyin.com',
            'v.douyin.com'  // Short URL domain
        ];
    }

    static extractVideoId(url) {
        if (!url) return null;

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            // v.douyin.com/xxxxxx (short URL - typically redirects)
            if (hostname === 'v.douyin.com') {
                return urlObj.pathname.slice(1).split('?')[0];
            }

            // douyin.com/video/xxxxxx or douyin.com/note/xxxxxx
            if (hostname.endsWith('douyin.com') || hostname.endsWith('iesdouyin.com')) {
                if (urlObj.pathname.startsWith('/video/') || urlObj.pathname.startsWith('/note/')) {
                    const pathParts = urlObj.pathname.split('/');
                    return pathParts[2]?.split('?')[0];
                }

                // Handle modal_id parameter (common in douyin URLs)
                const modalId = urlObj.searchParams.get('modal_id');
                if (modalId) {
                    return modalId;
                }
            }
        } catch (e) {
            return null;
        }

        return null;
    }

    loadApi() {
        // Douyin doesn't have a proper iframe API
        // We use direct iframe embed approach
        this.apiReady = true;
    }

    createPlayer(videoId, container, options = {}) {
        this.currentVideoId = videoId;

        // Get container element
        const containerEl = typeof container === 'string'
            ? document.getElementById(container)
            : container;

        if (!containerEl) return null;

        // Clear container
        containerEl.innerHTML = '';

        // Douyin embed URL
        // Note: Douyin doesn't have a public embed player like YouTube
        // We can try to use their share/embed page if available
        // For now, show a message that direct playback isn't supported

        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #fff;
            background: #000;
            text-align: center;
            padding: 20px;
        `;

        messageDiv.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 20px;">🎵 抖音视频</div>
            <div style="font-size: 14px; margin-bottom: 10px;">视频ID: ${videoId}</div>
            <div style="font-size: 12px; color: #888;">
                抖音暂不支持外部嵌入播放<br>
                请在抖音APP或网站中观看
            </div>
            <a href="${this.getVideoUrl(videoId)}" target="_blank" style="
                margin-top: 20px;
                padding: 10px 20px;
                background: #fe2c55;
                color: #fff;
                border-radius: 4px;
                text-decoration: none;
            ">打开抖音观看</a>
        `;

        containerEl.appendChild(messageDiv);

        this.player = messageDiv;

        // Update title
        document.title = '抖音视频 - PWA Player';
        navigator.mediaSession.metadata = new MediaMetadata({
            title: `抖音: ${videoId}`,
            artist: '抖音',
            album: '抖音'
        });

        const titleEl = document.querySelector("#nowPlayingInfo .track-title");
        const artistEl = document.querySelector("#nowPlayingInfo .track-artist");
        const urlEl = document.querySelector("#nowPlayingInfo .track-url");
        if (titleEl) titleEl.textContent = `抖音: ${videoId}`;
        if (artistEl) artistEl.textContent = '抖音';
        if (urlEl) urlEl.textContent = this.getVideoUrl(videoId);

        // Set play button state
        const playBtn = document.getElementById("playBtn");
        const npPlayBtn = document.getElementById("npPlayBtn");
        if (playBtn) playBtn.textContent = "▶️";
        if (npPlayBtn) npPlayBtn.textContent = "▶️";
        navigator.mediaSession.playbackState = 'paused';

        if (options.onReady) options.onReady();

        return this.player;
    }

    destroyPlayerInternal() {
        if (this.player && this.player.parentNode) {
            this.player.parentNode.removeChild(this.player);
        }
    }

    play() {
        // Not supported
    }

    pause() {
        // Not supported
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
        return `抖音: ${this.currentVideoId}`;
    }

    getVideoUrl(videoId) {
        if (!videoId) return '抖音';
        return `https://www.douyin.com/video/${videoId}`;
    }

    isPlaying() {
        return false;
    }
}

// Register Douyin platform
registerPlatform(DouyinPlatform);

// Legacy function names for backwards compatibility
window.extractDouyinVideoId = DouyinPlatform.extractVideoId;
window.isDouyinUrl = (url) => DouyinPlatform.isUrl(url);