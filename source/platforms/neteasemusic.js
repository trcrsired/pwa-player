// ===============================
// Netease Cloud Music Platform (网易云音乐)
// ===============================

class NeteaseMusicPlatform extends BasePlatform {
    static get name() {
        return 'neteasemusic';
    }

    static get domains() {
        return [
            '*.music.163.com',
            'music.163.com',
            '*.163.com',
            'y.music.163.com'  // Mobile/short URL
        ];
    }

    static extractVideoId(url) {
        if (!url) return null;

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            if (hostname.endsWith('163.com') || hostname.endsWith('music.163.com')) {
                // music.163.com/#/song?id=SONG_ID
                // music.163.com/song?id=SONG_ID (direct)
                // music.163.com/#/album?id=ALBUM_ID
                // music.163.com/#/playlist?id=PLAYLIST_ID
                // music.163.com/#/artist?id=ARTIST_ID

                // Check for hash-based routing
                let path = urlObj.pathname;
                if (urlObj.hash && urlObj.hash.length > 1) {
                    path = urlObj.hash.slice(1); // Remove #
                }

                const id = urlObj.searchParams.get('id');

                if (path.includes('/song') && id) {
                    return { type: 'song', id };
                }
                if (path.includes('/album') && id) {
                    return { type: 'album', id };
                }
                if (path.includes('/playlist') && id) {
                    return { type: 'playlist', id };
                }
                if (path.includes('/artist') && id) {
                    return { type: 'artist', id };
                }
                if (path.includes('/mv') && id) {
                    return { type: 'mv', id };
                }

                // If no specific type found, just use the id
                if (id) {
                    return { type: 'song', id };
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

        let embedSrc;
        let displayName;

        if (typeof videoId === 'object') {
            const { type, id } = videoId;

            if (type === 'song') {
                embedSrc = `https://music.163.com/outchain/player?type=2&id=${id}&auto=1`;
                displayName = `网易云音乐: ${id}`;
            } else if (type === 'playlist') {
                embedSrc = `https://music.163.com/outchain/player?type=0&id=${id}&auto=1`;
                displayName = `网易云歌单: ${id}`;
            } else if (type === 'album') {
                embedSrc = `https://music.163.com/outchain/player?type=1&id=${id}&auto=1`;
                displayName = `网易云专辑: ${id}`;
            } else if (type === 'mv') {
                embedSrc = `https://music.163.com/outchain/player?type=3&id=${id}&auto=1`;
                displayName = `网易云MV: ${id}`;
            } else {
                embedSrc = `https://music.163.com/outchain/player?type=2&id=${id}&auto=1`;
                displayName = `网易云音乐: ${id}`;
            }
        } else {
            embedSrc = `https://music.163.com/outchain/player?type=2&id=${videoId}&auto=1`;
            displayName = `网易云音乐: ${videoId}`;
        }

        const iframe = document.createElement('iframe');
        iframe.src = embedSrc;
        iframe.setAttribute('allow', 'autoplay');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.border = 'none';
        iframe.style.minHeight = '380px';
        iframe.id = 'neteasemusic-iframe';
        containerEl.appendChild(iframe);

        this.player = iframe;

        document.title = `${displayName} - PWA Player`;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: displayName,
            artist: '网易云音乐',
            album: '网易云音乐'
        });

        const titleEl = document.querySelector("#nowPlayingInfo .track-title");
        const artistEl = document.querySelector("#nowPlayingInfo .track-artist");
        const urlEl = document.querySelector("#nowPlayingInfo .track-url");
        if (titleEl) titleEl.textContent = displayName;
        if (artistEl) artistEl.textContent = '网易云音乐';
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
    getTitle() { return `网易云音乐: ${this.currentVideoId}`; }

    getVideoUrl(videoId) {
        if (!videoId) return '网易云音乐';
        if (typeof videoId === 'object') {
            const { type, id } = videoId;
            return `https://music.163.com/#/${type}?id=${id}`;
        }
        return `https://music.163.com/#/song?id=${videoId}`;
    }

    isPlaying() { return true; }
}

registerPlatform(NeteaseMusicPlatform);

window.extractNeteaseMusicVideoId = NeteaseMusicPlatform.extractVideoId;
window.isNeteaseMusicUrl = (url) => NeteaseMusicPlatform.isUrl(url);