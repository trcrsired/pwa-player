// ===============================
// Kick Platform
// ===============================

class KickPlatform extends PassiveEmbedPlatform {
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

        const videoId = contentInfo.videoId;

        let embedSrc;
        let displayName;

        if (typeof videoId === 'object') {
            const { type, id } = videoId;
            this.currentVideoId = id;

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
            this.currentVideoId = videoId;
        }

        const iframe = this.mountEmbedIframe(container, {
            src: embedSrc,
            id: 'kick-iframe',
            allow: 'autoplay; fullscreen',
            allowFullscreen: true
        });
        if (!iframe) return null;

        this.applyEmbedNowPlaying({
            title: displayName,
            artist: 'Kick',
            album: 'Kick',
            url: this.getVideoUrl(videoId)
        });

        if (options.onReady) options.onReady();

        return this.player;
    }

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

}

registerPlatform(KickPlatform);

window.extractKickVideoId = KickPlatform.extractVideoId;
window.isKickUrl = (url) => KickPlatform.isUrl(url);