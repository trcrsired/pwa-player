// ===============================
// Kick Platform
// ===============================

class KickPlatform extends BasePlatform {
    static get name() {
        return 'kick';
    }

    static get domains() {
        return [
            '*.kick.com',
            'kick.com'
        ];
    }

    static extractVideoId(url) {
        if (!url) return null;

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            if (hostname.endsWith('kick.com')) {
                const pathParts = urlObj.pathname.slice(1).split('/');

                // kick.com/CHANNEL_NAME
                // kick.com/video/VIDEO_ID
                // kick.com/clips/CLIP_ID
                if (pathParts[0] === 'video' && pathParts[1]) {
                    return { type: 'video', id: pathParts[1].split('?')[0] };
                }

                if (pathParts[0] === 'clips' && pathParts[1]) {
                    return { type: 'clip', id: pathParts[1].split('?')[0] };
                }

                if (pathParts[0]) {
                    return { type: 'channel', id: pathParts[0].split('?')[0] };
                }
            }
        } catch (e) {
            return null;
        }

        return null;
    }

    loadApi() {
        this.apiReady = true;
    }

    createPlayer(contentInfo, container, options = {}) {

        const containerEl = typeof container === 'string'
            ? document.getElementById(container)
            : container;

        if (!containerEl) return null;

        containerEl.innerHTML = '';
        const videoId = contentInfo.videoId;

        let embedSrc;
        let displayName;

        if (typeof videoId === 'object') {
            const { type, id } = videoId;

            if (type === 'channel') {
                embedSrc = `https://player.kick.com/${id}`;
                displayName = `Kick: ${id}`;
            } else if (type === 'video') {
                embedSrc = `https://player.kick.com/video/${id}`;
                displayName = `Kick Video: ${id}`;
            } else if (type === 'clip') {
                embedSrc = `https://player.kick.com/clip/${id}`;
                displayName = `Kick Clip: ${id}`;
            } else {
                embedSrc = `https://player.kick.com/${id}`;
                displayName = `Kick: ${id}`;
            }
        } else {
            embedSrc = `https://player.kick.com/${videoId}`;
            displayName = `Kick: ${videoId}`;
        }

        const iframe = document.createElement('iframe');
        iframe.src = embedSrc;
        iframe.setAttribute('allow', 'autoplay; fullscreen');
        iframe.setAttribute('allowfullscreen', 'true');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.border = 'none';
        iframe.id = 'kick-iframe';
        containerEl.appendChild(iframe);

        this.player = iframe;

        document.title = `${displayName} - PWA Player`;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: displayName,
            artist: 'Kick',
            album: 'Kick'
        });

        const titleEl = document.querySelector("#nowPlayingInfo .track-title");
        const artistEl = document.querySelector("#nowPlayingInfo .track-artist");
        const urlEl = document.querySelector("#nowPlayingInfo .track-url");
        if (titleEl) titleEl.textContent = displayName;
        if (artistEl) artistEl.textContent = 'Kick';
        if (urlEl) urlEl.textContent = this.getVideoUrl(videoId);

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

    play() { }
    pause() { }
    togglePlayPause() { }
    stop() { this.destroyPlayer(); }
    seekToPercent(percent) { }
    seekToTime(seconds) { }
    setVolume(percent) { localStorage.setItem('volume', percent.toString()); }
    getCurrentTime() { return 0; }
    getDuration() { return 0; }
    getTitle() { return `Kick: ${this.currentVideoId}`; }

    getVideoUrl(videoId) {
        if (!videoId) return 'Kick';
        if (typeof videoId === 'object') {
            const { type, id } = videoId;
            if (type === 'video') return `https://kick.com/video/${id}`;
            if (type === 'clip') return `https://kick.com/clips/${id}`;
            return `https://kick.com/${id}`;
        }
        return `https://kick.com/${videoId}`;
    }

    isPlaying() { return true; }
}

registerPlatform(KickPlatform);

window.extractKickVideoId = KickPlatform.extractVideoId;
window.isKickUrl = (url) => KickPlatform.isUrl(url);