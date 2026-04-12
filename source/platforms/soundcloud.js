// ===============================
// SoundCloud Platform
// ===============================

class SoundCloudPlatform extends BasePlatform {
    static get name() {
        return 'soundcloud';
    }

    static get domains() {
        return [
            '*.soundcloud.com',
            'soundcloud.com',
            'on.soundcloud.com'  // Short URL
        ];
    }

    static extractVideoId(url) {
        if (!url) return null;

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            // on.soundcloud.com/SHORT_ID
            if (hostname === 'on.soundcloud.com') {
                return urlObj.pathname.slice(1).split('?')[0];
            }

            // soundcloud.com/ARTIST/TRACK or soundcloud.com/ARTIST/sets/PLAYLIST
            if (hostname.endsWith('soundcloud.com')) {
                const pathParts = urlObj.pathname.slice(1).split('/');
                if (pathParts.length >= 2) {
                    // Return the full path as the "ID" since SoundCloud uses URLs
                    return urlObj.pathname;
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

    createPlayer(videoId, container, options = {}) {
        this.currentVideoId = videoId;

        const containerEl = typeof container === 'string'
            ? document.getElementById(container)
            : container;

        if (!containerEl) return null;

        containerEl.innerHTML = '';

        // SoundCloud embed URL format: https://w.soundcloud.com/player/?url=...
        const trackUrl = videoId.startsWith('/')
            ? `https://soundcloud.com${videoId}`
            : `https://on.soundcloud.com/${videoId}`;

        const embedSrc = `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=true&visual=true`;

        const iframe = document.createElement('iframe');
        iframe.src = embedSrc;
        iframe.setAttribute('allow', 'autoplay');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.border = 'none';
        iframe.id = 'soundcloud-iframe';
        containerEl.appendChild(iframe);

        this.player = iframe;

        const displayName = `SoundCloud: ${videoId.split('/').pop() || videoId}`;
        document.title = `${displayName} - PWA Player`;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: displayName,
            artist: 'SoundCloud',
            album: 'SoundCloud'
        });

        const titleEl = document.querySelector("#nowPlayingInfo .track-title");
        const artistEl = document.querySelector("#nowPlayingInfo .track-artist");
        const urlEl = document.querySelector("#nowPlayingInfo .track-url");
        if (titleEl) titleEl.textContent = displayName;
        if (artistEl) artistEl.textContent = 'SoundCloud';
        if (urlEl) urlEl.textContent = trackUrl;

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
    getTitle() { return `SoundCloud: ${this.currentVideoId}`; }

    getVideoUrl(videoId) {
        if (!videoId) return 'SoundCloud';
        if (videoId.startsWith('/')) {
            return `https://soundcloud.com${videoId}`;
        }
        return `https://on.soundcloud.com/${videoId}`;
    }

    isPlaying() { return true; }
}

registerPlatform(SoundCloudPlatform);

window.extractSoundCloudVideoId = SoundCloudPlatform.extractVideoId;
window.isSoundCloudUrl = (url) => SoundCloudPlatform.isUrl(url);