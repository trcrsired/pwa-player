// ===============================
// Douyin Platform (抖音) - Updated with API Support
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
            'v.douyin.com',
            'live.douyin.com'
        ];
    }

    /**
     * Extracts video or live ID from Douyin URLs
     * Supports: live.douyin.com, v.douyin.com, and standard video paths
     */
    static extractVideoId(url) {
        if (!url) return null;

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            // Handle Short URLs (v.douyin.com/abcde)
            if (hostname === 'v.douyin.com') {
                return { type: 'video', id: urlObj.pathname.slice(1).split('?')[0] };
            }

            // Handle Live URLs (live.douyin.com/123456)
            if (hostname === 'live.douyin.com') {
                const roomId = urlObj.pathname.slice(1).split('?')[0];
                return roomId ? { type: 'live', id: roomId } : null;
            }

            // Handle Standard Video/Note URLs
            if (hostname.endsWith('douyin.com') || hostname.endsWith('iesdouyin.com')) {
                const pathParts = urlObj.pathname.split('/');
                
                // Check for /video/ or /note/ paths
                if (urlObj.pathname.includes('/video/')) {
                    const idx = pathParts.indexOf('video');
                    return { type: 'video', id: pathParts[idx + 1]?.split('?')[0] };
                }

                // Handle modal_id param (common in search results)
                const modalId = urlObj.searchParams.get('modal_id');
                if (modalId) return { type: 'video', id: modalId };
            }
        } catch (e) {
            return null;
        }
        return null;
    }

    /**
     * Attempts to fetch IFrame code from Open Douyin API
     * Falls back to a "Bridge UI" if API fails
     */
    async createPlayer(contentInfo, container, options = {}) {
        const containerEl = typeof container === 'string' 
            ? document.getElementById(container) 
            : container;

        if (!containerEl) return null;

        const videoData = contentInfo.videoId;
        const finalId = typeof videoData === 'object' ? videoData.id : videoData;
        const finalType = typeof videoData === 'object' ? videoData.type : 'video';
        
        this.currentVideoId = videoData;

        // Reset and show container
        containerEl.innerHTML = '<div style="color:#fff; text-align:center; padding-top:20%;">Loading Douyin Player...</div>';
        containerEl.classList.remove('hidden');
        
        // Ensure container fills the wrapper
        containerEl.style.width = "100%";
        containerEl.style.height = "100%";
        containerEl.style.display = "block";

        // Logic branching: Live vs Video
        if (finalType === 'live') {
            this.renderFallbackUI(containerEl, finalId, 'live');
        } else {
            try {
                // Official Open Douyin API endpoint
                const apiUrl = `https://open.douyin.com/api/douyin/v1/video/get_iframe_by_video?video_id=${finalId}`;
                
                // Use the PWA's CORS Proxy from localStorage if available
                const proxy = localStorage.getItem('corsBypassUrl') || '';
                const response = await fetch(proxy + apiUrl);
                const result = await response.json();

                if (result.err_no === 0 && result.data.iframe_code) {
                    // Success: Inject the provided iframe code
                    containerEl.innerHTML = result.data.iframe_code;
                    const iframe = containerEl.querySelector('iframe');
                    if (iframe) {
                        iframe.style.width = '100%';
                        iframe.style.height = '100%';
                        iframe.style.border = 'none';
                        this.player = iframe;
                    }
                    this.updateMetadata('video', finalId, result.data.video_title);
                } else {
                    throw new Error(result.err_msg || 'Privacy restriction or API error');
                }
            } catch (err) {
                console.warn("Douyin API blocked or failed. Using fallback UI.", err);
                this.renderFallbackUI(containerEl, finalId, 'video');
            }
        }

        if (options.onReady) options.onReady();
        return this.player;
    }

    /**
     * UI used when IFrame cannot be embedded (CORS, Private Video, or Live)
     */
    renderFallbackUI(container, id, type) {
        const label = type === 'live' ? 'Douyin Live' : 'Douyin Video';
        const icon = type === 'live' ? '📺' : '🎵';
        
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; background:#000; color:#fff; text-align:center;">
                <div style="font-size:40px; margin-bottom:10px;">${icon}</div>
                <div style="font-size:20px; font-weight:bold; margin-bottom:5px;">${label}</div>
                <div style="font-size:12px; color:#888; margin-bottom:25px;">ID: ${id}</div>
                <a href="${this.getVideoUrl({type, id})}" target="_blank" style="
                    padding:12px 30px; background:#fe2c55; color:#fff; 
                    border-radius:25px; text-decoration:none; font-weight:bold;
                    box-shadow: 0 4px 15px rgba(254,44,85,0.3);
                ">Open in App / Browser</a>
            </div>
        `;
        this.player = container;
    }

    updateMetadata(type, id, title = null) {
        const labels = { channel: 'Douyin', video: 'Douyin Video', live: 'Douyin Live' };
        const displayName = title || `${labels[type] || 'Douyin'}: ${id}`;
        
        document.title = `${displayName} - PWA Player`;
        
        if (navigator.mediaSession) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: displayName,
                artist: 'Douyin',
                album: type === 'live' ? 'Live Stream' : 'Short Video'
            });
            navigator.mediaSession.playbackState = 'paused';
        }

        const titleEl = document.querySelector("#nowPlayingInfo .track-title");
        if (titleEl) titleEl.textContent = displayName;
    }

    getVideoUrl(videoId) {
        if (!videoId) return 'https://www.douyin.com';
        const { type, id } = typeof videoId === 'object' ? videoId : { type: 'video', id: videoId };
        
        if (type === 'live') return `https://live.douyin.com/${id}`;
        return `https://www.douyin.com/video/${id}`;
    }

    destroyPlayerInternal() {
        const container = document.getElementById('embeddedPlayer');
        if (container) container.innerHTML = '';
        this.player = null;
    }

    // Playback control is not possible via IFrame API for Douyin
    play() {}
    pause() {}
    togglePlayPause() {}
    setVolume(percent) { localStorage.setItem('volume', percent.toString()); }
    getCurrentTime() { return 0; }
    getDuration() { return 0; }
    isPlaying() { return false; }
}

registerPlatform(DouyinPlatform);