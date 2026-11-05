// ===============================
// SoundCloud Platform
// ===============================

class SoundCloudPlatform extends PassiveEmbedPlatform {
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

        // SoundCloud embed URL format: https://w.soundcloud.com/player/?url=...
        const trackUrl = videoId.startsWith('/')
            ? `https://soundcloud.com${videoId}`
            : `https://on.soundcloud.com/${videoId}`;

        const embedSrc = `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=true&visual=true`;

        const iframe = this.mountEmbedIframe(container, {
            src: embedSrc,
            id: 'soundcloud-iframe',
            allow: 'autoplay'
        });
        if (!iframe) return null;

        const displayName = `SoundCloud: ${videoId.split('/').pop() || videoId}`;
        this.applyEmbedNowPlaying({
            title: displayName,
            artist: 'SoundCloud',
            album: 'SoundCloud',
            url: trackUrl
        });

        if (options.onReady) options.onReady();

        return this.player;
    }

    getTitle() { return `SoundCloud: ${this.currentVideoId}`; }

    getVideoUrl(videoId) {
        if (!videoId) return 'SoundCloud';
        if (videoId.startsWith('/')) {
            return `https://soundcloud.com${videoId}`;
        }
        return `https://on.soundcloud.com/${videoId}`;
    }

}

registerPlatform(SoundCloudPlatform);

window.extractSoundCloudVideoId = SoundCloudPlatform.extractVideoId;
window.isSoundCloudUrl = (url) => SoundCloudPlatform.isUrl(url);