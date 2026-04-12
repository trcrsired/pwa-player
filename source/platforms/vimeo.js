// ===============================
// Vimeo Platform
// ===============================

class VimeoPlatform extends BasePlatform {
    static get name() {
        return 'vimeo';
    }

    static get domains() {
        return [
            '*.vimeo.com',
            'vimeo.com'
        ];
    }

    static extractVideoId(url) {
        if (!url) return null;

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            if (!hostname.endsWith('vimeo.com')) return null;

            // player.vimeo.com/video/VIDEO_ID
            if (hostname.endsWith('player.vimeo.com') && urlObj.pathname.startsWith('/video/')) {
                return urlObj.pathname.split('/')[2]?.split('?')[0];
            }

            // vimeo.com/VIDEO_ID
            if (hostname === 'vimeo.com') {
                const pathParts = urlObj.pathname.slice(1).split('/');
                // vimeo.com/channels/CHANNEL_ID/VIDEO_ID
                if (pathParts[0] === 'channels' && pathParts.length >= 3) {
                    return pathParts[2]?.split('?')[0];
                }
                // vimeo.com/VIDEO_ID (numeric)
                if (pathParts[0] && !isNaN(parseInt(pathParts[0], 10))) {
                    return pathParts[0]?.split('?')[0];
                }
            }
        } catch (e) {
            return null;
        }

        return null;
    }

    loadApi() {
        if (this.apiReady || this.apiLoading) return;

        this.apiLoading = true;

        const tag = document.createElement('script');
        tag.src = "https://player.vimeo.com/api/player.js";
        tag.onload = () => {
            this.apiReady = true;
            this.apiLoading = false;

            // If there's a pending video to play, play it
            if (window._pendingVimeoVideoId) {
                this.createPlayer(
                    window._pendingVimeoVideoId,
                    window._pendingVimeoContainer || 'embeddedPlayer',
                    window._pendingVimeoOptions || {}
                );
                window._pendingVimeoVideoId = null;
                window._pendingVimeoContainer = null;
                window._pendingVimeoOptions = null;
            }
        };
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    createPlayer(videoId, container, options = {}) {
        this.currentVideoId = videoId;

        if (!this.apiReady) {
            this.loadApi();
            window._pendingVimeoVideoId = videoId;
            window._pendingVimeoContainer = container;
            window._pendingVimeoOptions = options;
            return null;
        }

        // Check play mode for looping
        const playMode = typeof getPlayMode === 'function' ? getPlayMode() : 'once';
        const shouldLoop = playMode === 'repeat-one';

        // Get container element
        const containerEl = typeof container === 'string'
            ? document.getElementById(container)
            : container;

        if (!containerEl) return null;

        // Clear container
        containerEl.innerHTML = '';

        // Create iframe
        const iframe = document.createElement('iframe');
        iframe.src = `https://player.vimeo.com/video/${videoId}?autoplay=1&controls=1&title=0&byline=0&portrait=0${shouldLoop ? '&loop=1' : ''}`;
        iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
        iframe.setAttribute('allowfullscreen', 'true');
        iframe.setAttribute('playsinline', 'true');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.id = 'vimeo-iframe';
        containerEl.appendChild(iframe);

        // Create Vimeo Player instance
        this.player = new Vimeo.Player(iframe);

        // Set volume from stored preference
        const storedVolume = localStorage.getItem('volume');
        if (storedVolume) {
            const vol = parseInt(storedVolume, 10) / 100; // Vimeo uses 0-1
            this.player.setVolume(vol);
            const volumeSlider = document.getElementById("volumeSlider");
            const npVolumeSlider = document.getElementById("npVolumeSlider");
            if (volumeSlider) volumeSlider.value = parseInt(storedVolume, 10);
            if (npVolumeSlider) npVolumeSlider.value = parseInt(storedVolume, 10);
        }

        // Update title and Now Playing info
        this.player.getVideoTitle().then(title => {
            document.title = title + ' - PWA Player';
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: 'Vimeo',
                album: 'Vimeo'
            });

            const titleEl = document.querySelector("#nowPlayingInfo .track-title");
            const artistEl = document.querySelector("#nowPlayingInfo .track-artist");
            const urlEl = document.querySelector("#nowPlayingInfo .track-url");
            if (titleEl) titleEl.textContent = title;
            if (artistEl) artistEl.textContent = 'Vimeo';
            if (urlEl) urlEl.textContent = this.getVideoUrl(videoId);

            // Update playlist entry with fetched title if we have playlist info
            if (options && options.playlist) {
                const { playlistName, entryPath } = options.playlist;
                if (typeof updatePlaylistEntryName === 'function') {
                    updatePlaylistEntryName(playlistName, entryPath, title);
                }
            }
        }).catch(() => {
            document.title = 'Vimeo Video - PWA Player';
            const titleEl = document.querySelector("#nowPlayingInfo .track-title");
            const urlEl = document.querySelector("#nowPlayingInfo .track-url");
            if (titleEl) titleEl.textContent = 'Vimeo Video';
            if (urlEl) urlEl.textContent = this.getVideoUrl(videoId);
        });

        // Set up event handlers
        this.player.on('play', () => {
            const playBtn = document.getElementById("playBtn");
            const npPlayBtn = document.getElementById("npPlayBtn");
            if (playBtn) playBtn.textContent = "⏸️";
            if (npPlayBtn) npPlayBtn.textContent = "⏸️";
            navigator.mediaSession.playbackState = 'playing';

            if (!this.progressInterval) {
                this.startProgressUpdates(() => this.updateProgress());
            }

            if (options.onPlay) options.onPlay();
        });

        this.player.on('pause', () => {
            const playBtn = document.getElementById("playBtn");
            const npPlayBtn = document.getElementById("npPlayBtn");
            if (playBtn) playBtn.textContent = "▶️";
            if (npPlayBtn) npPlayBtn.textContent = "▶️";
            navigator.mediaSession.playbackState = 'paused';

            if (options.onPause) options.onPause();
        });

        this.player.on('ended', () => {
            const playBtn = document.getElementById("playBtn");
            const npPlayBtn = document.getElementById("npPlayBtn");
            if (playBtn) playBtn.textContent = "▶️";
            if (npPlayBtn) npPlayBtn.textContent = "▶️";
            navigator.mediaSession.playbackState = 'paused';

            this.stopProgressUpdates();

            if (!this.handleVideoEnded()) {
                if (typeof playNext === 'function') playNext();
            }

            if (options.onEnded) options.onEnded();
        });

        // Start progress updates
        this.startProgressUpdates(() => this.updateProgress());

        return this.player;
    }

    updateProgress() {
        if (!this.player) return;

        Promise.all([this.player.getCurrentTime(), this.player.getDuration()])
            .then(([currentTime, duration]) => {
                if (!duration || duration === 0) return;

                // Cache for A-B loop and other features that need synchronous access
                window._cachedEmbeddedCurrentTime = currentTime;
                window._cachedEmbeddedDuration = duration;

                const progressBar = document.getElementById("progressBar");
                const npProgressBar = document.getElementById("npProgressBar");
                const timeDisplay = document.getElementById("timeDisplay");
                const npTimeDisplay = document.getElementById("npTimeDisplay");

                const percent = (currentTime / duration) * 100;

                // Don't update progress bar value while user is dragging it
                if (!window.isDraggingProgressBar) {
                    if (progressBar) progressBar.value = percent;
                    if (npProgressBar) npProgressBar.value = percent;
                }

                const timeText = `${formatEmbedTime(currentTime)} / ${formatEmbedTime(duration)}`;
                if (timeDisplay && !window.timeInputActive) timeDisplay.textContent = timeText;
                if (npTimeDisplay && !window.npTimeInputActive) npTimeDisplay.textContent = timeText;
            })
            .catch(() => {});
    }

    destroyPlayerInternal() {
        if (this.player) {
            this.player.destroy();
        }
    }

    play() {
        if (this.player) this.player.play();
    }

    pause() {
        if (this.player) this.player.pause();
    }

    togglePlayPause() {
        if (!this.player) return;
        this.player.getPaused().then(paused => {
            if (paused) {
                this.play();
            } else {
                this.pause();
            }
        }).catch(() => {});
    }

    stop() {
        this.destroyPlayer();
    }

    seekToPercent(percent) {
        if (!this.player) return;
        this.player.getDuration().then(duration => {
            this.seekToTime((percent / 100) * duration);
        }).catch(() => {});
    }

    seekToTime(seconds) {
        if (this.player) this.player.setCurrentTime(seconds);
    }

    setVolume(percent) {
        if (this.player) this.player.setVolume(percent / 100);
        localStorage.setItem('volume', percent.toString());
    }

    getCurrentTime() {
        if (this.player) {
            return this.player.getCurrentTime();
        }
        return Promise.resolve(0);
    }

    getDuration() {
        if (this.player) {
            return this.player.getDuration();
        }
        return Promise.resolve(0);
    }

    getTitle() {
        if (this.player) {
            return this.player.getVideoTitle();
        }
        return Promise.resolve(null);
    }

    getVideoUrl(videoId) {
        return videoId ? `https://vimeo.com/${videoId}` : 'Vimeo';
    }

    isPlaying() {
        if (this.player) {
            return this.player.getPaused().then(paused => !paused);
        }
        return Promise.resolve(false);
    }
}

// Register Vimeo platform
registerPlatform(VimeoPlatform);

// Legacy function names for backwards compatibility
window.extractVimeoVideoId = VimeoPlatform.extractVideoId;
window.isVimeoUrl = VimeoPlatform.isUrl;