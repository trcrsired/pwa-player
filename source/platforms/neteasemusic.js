// ===============================
// Netease Cloud Music Platform (网易云音乐)
// ===============================

class NeteaseMusicPlatform extends PassiveEmbedPlatform {
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

        const iframe = this.mountEmbedIframe(container, {
            src: embedSrc,
            id: 'neteasemusic-iframe',
            allow: 'autoplay',
            styles: { minHeight: '380px' }
        });
        if (!iframe) return null;

        this.applyEmbedNowPlaying({
            title: displayName,
            artist: '网易云音乐',
            album: '网易云音乐',
            url: this.getVideoUrl(videoId)
        });

        if (options.onReady) options.onReady();

        return this.player;
    }

    getTitle() { return `网易云音乐: ${this.currentVideoId}`; }

    getVideoUrl(videoId) {
        if (!videoId) return '网易云音乐';
        if (typeof videoId === 'object') {
            const { type, id } = videoId;
            return `https://music.163.com/#/${type}?id=${id}`;
        }
        return `https://music.163.com/#/song?id=${videoId}`;
    }

}

registerPlatform(NeteaseMusicPlatform);

window.extractNeteaseMusicVideoId = NeteaseMusicPlatform.extractVideoId;
window.isNeteaseMusicUrl = (url) => NeteaseMusicPlatform.isUrl(url);