// ===============================
// Apple Music Platform
// ===============================

class AppleMusicPlatform extends BasePlatform {
    static get name() {
        return 'applemusic';
    }

    static get domains() {
        return [
            '*.music.apple.com',
            'music.apple.com',
            '*.apple.com',
            'apple.com',
            'embed.music.apple.com'
        ];
    }

    static extractVideoId(url) {
        if (!url) return null;

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            if (hostname.endsWith('apple.com') || hostname.endsWith('music.apple.com')) {
                // music.apple.com/us/album/ALBUM_NAME/ALBUM_ID?i=TRACK_ID
                // music.apple.com/us/playlist/PLAYLIST_NAME/PLAYLIST_ID
                // music.apple.com/us/artist/ARTIST_NAME/ARTIST_ID
                const pathParts = urlObj.pathname.slice(1).split('/');

                if (pathParts.length >= 3) {
                    const country = pathParts[0];
                    const type = pathParts[1];
                    const id = pathParts[3] || pathParts[2];

                    // For album with track, get the track ID from query param
                    const trackId = urlObj.searchParams.get('i');

                    if (type === 'album' && trackId) {
                        return { type: 'song', id: trackId, albumId: id, country };
                    }

                    return { type, id, country };
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

        const containerEl = typeof container === 'string'
            ? document.getElementById(container)
            : container;

        if (!containerEl) return null;

        containerEl.innerHTML = '';

        let embedSrc;
        let displayName;

        if (typeof videoId === 'object') {
            const { type, id, country, albumId } = videoId;
            this.currentVideoId = id;

            if (type === 'song' && albumId) {
                embedSrc = `https://embed.music.apple.com/${country}/album/${albumId}?i=${id}& autoplay=true`;
                displayName = `Apple Music: ${id}`;
            } else {
                embedSrc = `https://embed.music.apple.com/${country}/${type}/${id}?autoplay=true`;
                displayName = `Apple Music ${type}: ${id}`;
            }
        } else {
            embedSrc = `https://embed.music.apple.com/us/album/${videoId}?autoplay=true`;
            displayName = `Apple Music: ${videoId}`;
            this.currentVideoId = videoId;
        }

        const iframe = document.createElement('iframe');
        iframe.src = embedSrc;
        iframe.setAttribute('allow', 'autoplay; encrypted-media');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.border = 'none';
        iframe.id = 'applemusic-iframe';
        containerEl.appendChild(iframe);

        this.player = iframe;

        document.title = `${displayName} - PWA Player`;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: displayName,
            artist: 'Apple Music',
            album: 'Apple Music'
        });

        const titleEl = document.querySelector("#nowPlayingInfo .track-title");
        const artistEl = document.querySelector("#nowPlayingInfo .track-artist");
        const urlEl = document.querySelector("#nowPlayingInfo .track-url");
        if (titleEl) titleEl.textContent = displayName;
        if (artistEl) artistEl.textContent = 'Apple Music';
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
    getTitle() { return `Apple Music: ${this.currentVideoId}`; }

    getVideoUrl(videoId) {
        if (!videoId) return 'Apple Music';
        if (typeof videoId === 'object') {
            const { type, id, country, albumId } = videoId;
            if (type === 'song' && albumId) {
                return `https://music.apple.com/${country}/album/${albumId}?i=${id}`;
            }
            return `https://music.apple.com/${country}/${type}/${id}`;
        }
        return `https://music.apple.com/us/album/${videoId}`;
    }

    isPlaying() { return true; }
}

registerPlatform(AppleMusicPlatform);

window.extractAppleMusicVideoId = AppleMusicPlatform.extractVideoId;
window.isAppleMusicUrl = (url) => AppleMusicPlatform.isUrl(url);