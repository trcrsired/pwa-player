// ===============================
// Twitch Platform
// ===============================

class TwitchPlatform extends BasePlatform {
    static get name() {
        return 'twitch';
    }

    static get domains() {
        return [
            '*.twitch.tv',
            'twitch.tv',
            'go.twitch.tv',
            'm.twitch.tv',
            'clips.twitch.tv'
        ];
    }

    static extractVideoId(url) {
        if (!url) return null;

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            // clips.twitch.tv/CLIP_ID
            if (hostname === 'clips.twitch.tv' || hostname.endsWith('clips.twitch.tv')) {
                return urlObj.pathname.slice(1).split('?')[0];
            }

            // twitch.tv/CHANNEL_NAME or twitch.tv/videos/VIDEO_ID
            if (hostname.endsWith('twitch.tv')) {
                const pathParts = urlObj.pathname.slice(1).split('/');

                // twitch.tv/videos/VIDEO_ID
                if (pathParts[0] === 'videos' && pathParts[1]) {
                    return { type: 'video', id: pathParts[1].split('?')[0] };
                }

                // twitch.tv/CHANNEL_NAME/clip/CLIP_ID
                if (pathParts[1] === 'clip' && pathParts[2]) {
                    return { type: 'clip', id: pathParts[2].split('?')[0] };
                }

                // twitch.tv/CHANNEL_NAME - return channel name
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
        // Twitch uses iframe embed, no API needed
        this.apiReady = true;
    }

    createPlayer(videoId, container, options = {}) {
        this.currentVideoId = videoId;

        const containerEl = typeof container === 'string'
            ? document.getElementById(container)
            : container;

        if (!containerEl) return null;

        containerEl.innerHTML = '';

        // Handle different video ID types
        let embedSrc;
        let displayName;

        if (typeof videoId === 'object') {
            const { type, id } = videoId;

            if (type === 'channel') {
                embedSrc = `https://player.twitch.tv/?channel=${id}&parent=${window.location.hostname}&autoplay=true`;
                displayName = `Twitch: ${id}`;
            } else if (type === 'video') {
                embedSrc = `https://player.twitch.tv/?video=${id}&parent=${window.location.hostname}&autoplay=true`;
                displayName = `Twitch Video: ${id}`;
            } else if (type === 'clip') {
                embedSrc = `https://player.twitch.tv/?clip=${id}&parent=${window.location.hostname}&autoplay=true`;
                displayName = `Twitch Clip: ${id}`;
            } else {
                embedSrc = `https://player.twitch.tv/?channel=${id}&parent=${window.location.hostname}&autoplay=true`;
                displayName = `Twitch: ${id}`;
            }
        } else {
            // Assume it's a channel name if string
            embedSrc = `https://player.twitch.tv/?channel=${videoId}&parent=${window.location.hostname}&autoplay=true`;
            displayName = `Twitch: ${videoId}`;
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
        iframe.id = 'twitch-iframe';
        containerEl.appendChild(iframe);

        this.player = iframe;

        // Update title
        document.title = `${displayName} - PWA Player`;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: displayName,
            artist: 'Twitch',
            album: 'Twitch'
        });

        const titleEl = document.querySelector("#nowPlayingInfo .track-title");
        const artistEl = document.querySelector("#nowPlayingInfo .track-artist");
        const urlEl = document.querySelector("#nowPlayingInfo .track-url");
        if (titleEl) titleEl.textContent = displayName;
        if (artistEl) artistEl.textContent = 'Twitch';
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
    getTitle() { return `Twitch: ${this.currentVideoId}`; }

    getVideoUrl(videoId) {
        if (!videoId) return 'Twitch';
        if (typeof videoId === 'object') {
            const { type, id } = videoId;
            if (type === 'video') return `https://www.twitch.tv/videos/${id}`;
            if (type === 'clip') return `https://clips.twitch.tv/${id}`;
            return `https://www.twitch.tv/${id}`;
        }
        return `https://www.twitch.tv/${videoId}`;
    }

    isPlaying() { return true; }
}

registerPlatform(TwitchPlatform);

window.extractTwitchVideoId = TwitchPlatform.extractVideoId;
window.isTwitchUrl = (url) => TwitchPlatform.isUrl(url);