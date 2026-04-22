// ===============================
// Twitch Platform - Corrected SDK Implementation
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

            if (hostname === 'clips.twitch.tv' || hostname.endsWith('clips.twitch.tv')) {
                return { type: 'clip', id: urlObj.pathname.slice(1).split('?')[0] };
            }

            if (hostname.endsWith('twitch.tv')) {
                const pathParts = urlObj.pathname.slice(1).split('/');
                if (pathParts[0] === 'videos' && pathParts[1]) {
                    return { type: 'video', id: pathParts[1].split('?')[0] };
                }
                if (pathParts[1] === 'clip' && pathParts[2]) {
                    return { type: 'clip', id: pathParts[2].split('?')[0] };
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

    async loadApi() {
        if (window.Twitch && window.Twitch.Embed) {
            return;
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = "https://embed.twitch.tv/embed/v1.js";
            document.head.appendChild(script);
            script.onload = () => {
                // Double-check the object exists before resolving
                if (window.Twitch) {
                    resolve();
                } else {
                    reject(new Error("Twitch SDK loaded but 'Twitch' object is missing."));
                }
            };
            script.onerror = () => reject(new Error("Twitch SDK failed to load."));
            return script;
        });
    }

    async createPlayer(contentInfo, container, options = {}) {
        // 1. Target the existing embeddedPlayer from your HTML
        const containerEl = typeof container === 'string' ? document.getElementById(container) : container;
        if (!containerEl) return null;

        // 2. Ensure SDK is ready
        if (!window.Twitch) {
            await this.loadApi();
        }

        const videoId = contentInfo.videoId;
        let finalId, finalType;
        
        // Handle both object and string formats
        if (typeof videoId === 'object' && videoId !== null) {
            finalId = videoId.id;
            finalType = videoId.type;
        } else {
            finalId = videoId;
            finalType = 'channel';
        }

        // 3. Prepare the container
        containerEl.innerHTML = ''; // Clear any previous YouTube/other embeds
        containerEl.classList.remove('hidden'); // Show the div
        // Force containerEl to have size so the SDK can inherit it
        containerEl.style.display = "block";
        containerEl.style.width = "100%";
        containerEl.style.height = "100%";

        // The SDK needs an element with an ID to replace
        const embedId = 'twitch-sdk-target';
        const targetDiv = document.createElement('div');
        targetDiv.id = embedId;
        targetDiv.style.width = "100%";
        targetDiv.style.height = "100%";
        containerEl.appendChild(targetDiv);

        // 4. Build options for the SDK
        const embedOptions = {
            width: '100%',
            height: '100%',
            autoplay: true,
            layout: 'video', 
            parent: [window.location.hostname || "localhost"], 
            theme: 'dark'
        };

        if (finalType === 'video') embedOptions.video = finalId;
        else if (finalType === 'clip') embedOptions.clip = finalId;
        else embedOptions.channel = finalId;

        // 5. Initialize inside the existing wrapper hierarchy
        this.embed = new window.Twitch.Embed(embedId, embedOptions);

        this.embed.addEventListener(window.Twitch.Embed.VIDEO_READY, () => {
            this.player = this.embed.getPlayer();
            if (options.onReady) options.onReady();
        });

        this.updateMetadata(finalType, finalId);
        return this.embed;
    }

    updateMetadata(type, id) {
        const labels = { channel: 'Twitch', video: 'Twitch Video', clip: 'Twitch Clip' };
        const displayName = `${labels[type] || 'Twitch'}: ${id}`;
        
        document.title = `${displayName} - PWA Player`;
        
        if (navigator.mediaSession) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: displayName,
                artist: 'Twitch',
                album: 'Live Stream'
            });
            navigator.mediaSession.playbackState = 'playing';
        }

        const titleEl = document.querySelector("#nowPlayingInfo .track-title");
        if (titleEl) titleEl.textContent = displayName;
    }

    // Programmatic Controls via SDK
    play() { console.log("play twitch"); if (this.player) this.player.play(); }
    
    pause() { console.log("pause twitch", this.player);  if (this.player) this.player.pause(); }

    togglePlayPause() {
        if (!this.player) return;
        this.player.isPaused() ? this.player.play() : this.player.pause();
    }

    seekToTime(seconds) { if (this.player) this.player.seek(seconds); }

    setVolume(percent) {
        if (this.player) {
            this.player.setVolume(percent / 100);
            localStorage.setItem('volume', percent.toString());
        }
    }

    getCurrentTime() { return this.player ? this.player.getCurrentTime() : 0; }
    
    getDuration() { return this.player ? this.player.getDuration() : 0; }

    destroyPlayerInternal() {
        // The SDK creates an iframe inside our container, clearing innerHTML is usually sufficient
        const container = document.getElementById('twitch-embed-container');
        if (container) container.innerHTML = '';
        this.player = null;
        this.embed = null;
    }

    getVideoUrl(videoId) {
        if (!videoId) return 'https://www.twitch.tv';
        const { type, id } = typeof videoId === 'object' ? videoId : { type: 'channel', id: videoId };
        if (type === 'video') return `https://www.twitch.tv/videos/${id}`;
        if (type === 'clip') return `https://clips.twitch.tv/${id}`;
        return `https://www.twitch.tv/${id}`;
    }

    isPlaying() { return this.player ? !this.player.isPaused() : false; }
}

registerPlatform(TwitchPlatform);