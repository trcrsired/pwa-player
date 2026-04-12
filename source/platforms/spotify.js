// ===============================
// Spotify Platform (using Spotify IFrame API)
// ===============================

class SpotifyPlatform extends BasePlatform {
    static get name() {
        return 'spotify';
    }

    static get domains() {
        return [
            '*.spotify.com',
            'spotify.com',
            'open.spotify.com',
            'play.spotify.com'
        ];
    }

    static extractVideoId(url) {
        if (!url) return null;

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            if (hostname.endsWith('spotify.com')) {
                const pathParts = urlObj.pathname.slice(1).split('/');

                // open.spotify.com/track/TRACK_ID
                // open.spotify.com/album/ALBUM_ID
                // open.spotify.com/playlist/PLAYLIST_ID
                // open.spotify.com/artist/ARTIST_ID
                // open.spotify.com/show/SHOW_ID (podcast)
                // open.spotify.com/episode/EPISODE_ID
                if (pathParts.length >= 2) {
                    const type = pathParts[0];
                    const id = pathParts[1].split('?')[0];
                    return { type, id };
                }
            }
        } catch (e) {
            return null;
        }

        return null;
    }

    constructor() {
        super();
        this.embedController = null;
        this.playbackState = {
            isPaused: true,
            isBuffering: false,
            duration: 0,
            position: 0,
            playingURI: null
        };
        this.trackEndedTriggered = false;
        this.wasNearEnd = false; // Track if we were near the end of the track
        this.lastPlayingURI = null; // Track the URI that was playing
    }

    loadApi() {
        if (this.apiReady || this.apiLoading) return;

        this.apiLoading = true;

        // Load Spotify IFrame API
        const tag = document.createElement('script');
        tag.src = "https://open.spotify.com/embed/iframe-api/v1";
        tag.async = true;
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    createPlayer(videoId, container, options = {}) {
        this.currentVideoId = videoId;

        // Get container element
        const containerEl = typeof container === 'string'
            ? document.getElementById(container)
            : container;

        if (!containerEl) return null;

        // Clear container
        containerEl.innerHTML = '';

        // Create a wrapper element for the embed
        const embedWrapper = document.createElement('div');
        embedWrapper.id = 'spotify-embed-wrapper';
        embedWrapper.style.width = '100%';
        embedWrapper.style.height = '100%';
        embedWrapper.style.position = 'absolute';
        embedWrapper.style.top = '0';
        embedWrapper.style.left = '0';
        containerEl.appendChild(embedWrapper);

        // Build Spotify URI
        let spotifyUri;
        if (typeof videoId === 'object') {
            const { type, id } = videoId;
            spotifyUri = `spotify:${type}:${id}`;
        } else {
            spotifyUri = `spotify:track:${videoId}`;
        }

        // Check if API is ready
        if (!window._spotifyIFrameAPIReady) {
            // Store pending data
            window._pendingSpotifyData = {
                videoId,
                container: embedWrapper,
                spotifyUri,
                options,
                platformInstance: this
            };
            this.loadApi();
            return null;
        }

        // Create controller using Spotify IFrame API
        const IFrameAPI = window._spotifyIFrameAPI;
        const embedOptions = {
            uri: spotifyUri,
            width: '100%',
            height: '100%'
        };

        const callback = (EmbedController) => {
            this.embedController = EmbedController;
            this.player = EmbedController;

            // Add event listeners
            EmbedController.addListener('ready', () => {
                console.log('Spotify Embed ready');
                // Start playback automatically
                EmbedController.play();
                if (options.onReady) options.onReady();
            });

            EmbedController.addListener('playback_started', (e) => {
                this.playbackState.playingURI = e.data.playingURI;
                this.playbackState.isPaused = false;

                const playBtn = document.getElementById("playBtn");
                const npPlayBtn = document.getElementById("npPlayBtn");
                if (playBtn) playBtn.textContent = "⏸️";
                if (npPlayBtn) npPlayBtn.textContent = "⏸️";
                navigator.mediaSession.playbackState = 'playing';
            });

            EmbedController.addListener('playback_update', (e) => {
                const prevPlayingURI = this.playbackState.playingURI;
                const prevPosition = this.playbackState.position;
                const prevIsPaused = this.playbackState.isPaused;

                this.playbackState = {
                    playingURI: e.data.playingURI,
                    isPaused: e.data.isPaused,
                    isBuffering: e.data.isBuffering,
                    duration: e.data.duration,
                    position: e.data.position
                };

                const duration = e.data.duration;
                const position = e.data.position;
                const isPaused = e.data.isPaused;
                const playingURI = e.data.playingURI;

                // Track if we're near the end (within 3 seconds)
                if (duration > 0 && position >= duration - 3000 && !isPaused) {
                    this.wasNearEnd = true;
                    this.lastPlayingURI = playingURI;
                }

                // Reset trackEndedTriggered when a new track starts in Spotify
                if (playingURI !== prevPlayingURI) {
                    this.trackEndedTriggered = false;

                    // If we were near end and now a different track started,
                    // the current track ended - advance our playlist
                    if (this.wasNearEnd && playingURI !== this.lastPlayingURI) {
                        this.wasNearEnd = false;
                        this.trackEndedTriggered = true;
                        this.stopProgressUpdates();

                        if (!this.handleVideoEnded()) {
                            if (typeof playNext === 'function') playNext();
                        }
                    }
                }

                // Detect track ended: was near end, now paused
                if (this.wasNearEnd && isPaused && !prevIsPaused) {
                    if (!this.trackEndedTriggered) {
                        this.wasNearEnd = false;
                        this.trackEndedTriggered = true;
                        this.stopProgressUpdates();

                        if (!this.handleVideoEnded()) {
                            if (typeof playNext === 'function') playNext();
                        }
                    }
                }

                // Detect position reset after being near end (Spotify restarted same track)
                if (this.wasNearEnd && position < 5000 && prevPosition >= duration - 3000) {
                    if (!this.trackEndedTriggered) {
                        this.wasNearEnd = false;
                        this.trackEndedTriggered = true;
                        this.stopProgressUpdates();

                        if (!this.handleVideoEnded()) {
                            if (typeof playNext === 'function') playNext();
                        }
                    }
                }

                // Update play button state
                const playBtn = document.getElementById("playBtn");
                const npPlayBtn = document.getElementById("npPlayBtn");
                if (isPaused) {
                    if (playBtn) playBtn.textContent = "▶️";
                    if (npPlayBtn) npPlayBtn.textContent = "▶️";
                    navigator.mediaSession.playbackState = 'paused';
                } else {
                    if (playBtn) playBtn.textContent = "⏸️";
                    if (npPlayBtn) npPlayBtn.textContent = "⏸️";
                    navigator.mediaSession.playbackState = 'playing';
                }

                // Update progress display
                this.updateProgress();
            });

            // Update title
            const displayName = this.getTitle();
            document.title = `${displayName} - PWA Player`;
            navigator.mediaSession.metadata = new MediaMetadata({
                title: displayName,
                artist: 'Spotify',
                album: 'Spotify'
            });

            const titleEl = document.querySelector("#nowPlayingInfo .track-title");
            const artistEl = document.querySelector("#nowPlayingInfo .track-artist");
            const urlEl = document.querySelector("#nowPlayingInfo .track-url");
            if (titleEl) titleEl.textContent = displayName;
            if (artistEl) artistEl.textContent = 'Spotify';
            if (urlEl) urlEl.textContent = this.getVideoUrl(videoId);

            // Start progress updates
            this.startProgressUpdates(() => this.updateProgress());
        };

        IFrameAPI.createController(embedWrapper, embedOptions, callback);

        return this.embedController;
    }

    updateProgress() {
        const duration = this.playbackState.duration / 1000; // Convert ms to seconds
        const position = this.playbackState.position / 1000;

        if (!duration || duration === 0) return;

        // Cache for A-B loop and other features that need synchronous access
        window._cachedEmbeddedCurrentTime = position;
        window._cachedEmbeddedDuration = duration;

        const progressBar = document.getElementById("progressBar");
        const npProgressBar = document.getElementById("npProgressBar");
        const timeDisplay = document.getElementById("timeDisplay");
        const npTimeDisplay = document.getElementById("npTimeDisplay");

        const percent = (position / duration) * 100;

        // Don't update progress bar value while user is dragging it
        if (!window.isDraggingProgressBar) {
            if (progressBar) progressBar.value = percent;
            if (npProgressBar) npProgressBar.value = percent;
        }

        const timeText = `${formatEmbedTime(position)} / ${formatEmbedTime(duration)}`;
        if (timeDisplay && !window.timeInputActive) timeDisplay.textContent = timeText;
        if (npTimeDisplay && !window.npTimeInputActive) npTimeDisplay.textContent = timeText;
    }

    destroyPlayerInternal() {
        if (this.embedController) {
            this.embedController.destroy();
            this.embedController = null;
        }
        this.stopProgressUpdates();
    }

    play() {
        if (this.embedController) {
            this.embedController.play();
        }
    }

    pause() {
        if (this.embedController) {
            this.embedController.pause();
        }
    }

    togglePlayPause() {
        if (this.embedController) {
            this.embedController.togglePlay();
        }
    }

    stop() {
        this.destroyPlayer();
    }

    seekToPercent(percent) {
        if (this.embedController && this.playbackState.duration > 0) {
            const seconds = (percent / 100) * (this.playbackState.duration / 1000);
            this.embedController.seek(Math.floor(seconds));
        }
    }

    seekToTime(seconds) {
        if (this.embedController) {
            this.embedController.seek(Math.floor(seconds));
        }
    }

    setVolume(percent) {
        // Spotify IFrame API doesn't have volume control
        localStorage.setItem('volume', percent.toString());
    }

    getCurrentTime() {
        return this.playbackState.position / 1000;
    }

    getDuration() {
        return this.playbackState.duration / 1000;
    }

    getTitle() {
        if (this.currentVideoId) {
            if (typeof this.currentVideoId === 'object') {
                const { type, id } = this.currentVideoId;
                return `Spotify ${type}: ${id}`;
            }
            return `Spotify: ${this.currentVideoId}`;
        }
        return 'Spotify';
    }

    getVideoUrl(videoId) {
        if (!videoId) return 'Spotify';
        if (typeof videoId === 'object') {
            return `https://open.spotify.com/${videoId.type}/${videoId.id}`;
        }
        return `https://open.spotify.com/track/${videoId}`;
    }

    isPlaying() {
        return !this.playbackState.isPaused;
    }
}

// Global callback for Spotify IFrame API
window.onSpotifyIframeApiReady = (IFrameAPI) => {
    window._spotifyIFrameAPIReady = true;
    window._spotifyIFrameAPI = IFrameAPI;

    // If there's a pending video to play, play it
    if (window._pendingSpotifyData) {
        const { videoId, container, spotifyUri, options, platformInstance } = window._pendingSpotifyData;

        const embedOptions = {
            uri: spotifyUri,
            width: '100%',
            height: '100%'
        };

        const callback = (EmbedController) => {
            platformInstance.embedController = EmbedController;
            platformInstance.player = EmbedController;

            EmbedController.addListener('ready', () => {
                // Start playback automatically
                EmbedController.play();
                if (options.onReady) options.onReady();
            });

            EmbedController.addListener('playback_started', (e) => {
                platformInstance.playbackState.playingURI = e.data.playingURI;
                platformInstance.playbackState.isPaused = false;

                const playBtn = document.getElementById("playBtn");
                const npPlayBtn = document.getElementById("npPlayBtn");
                if (playBtn) playBtn.textContent = "⏸️";
                if (npPlayBtn) npPlayBtn.textContent = "⏸️";
                navigator.mediaSession.playbackState = 'playing';
            });

            EmbedController.addListener('playback_update', (e) => {
                const prevPlayingURI = platformInstance.playbackState.playingURI;
                const prevPosition = platformInstance.playbackState.position;
                const prevIsPaused = platformInstance.playbackState.isPaused;

                platformInstance.playbackState = {
                    playingURI: e.data.playingURI,
                    isPaused: e.data.isPaused,
                    isBuffering: e.data.isBuffering,
                    duration: e.data.duration,
                    position: e.data.position
                };

                const duration = e.data.duration;
                const position = e.data.position;
                const isPaused = e.data.isPaused;
                const playingURI = e.data.playingURI;

                // Track if we're near the end (within 3 seconds)
                if (duration > 0 && position >= duration - 3000 && !isPaused) {
                    platformInstance.wasNearEnd = true;
                    platformInstance.lastPlayingURI = playingURI;
                }

                // Reset trackEndedTriggered when a new track starts in Spotify
                if (playingURI !== prevPlayingURI) {
                    platformInstance.trackEndedTriggered = false;

                    // If we were near end and now a different track started,
                    // the current track ended - advance our playlist
                    if (platformInstance.wasNearEnd && playingURI !== platformInstance.lastPlayingURI) {
                        platformInstance.wasNearEnd = false;
                        platformInstance.trackEndedTriggered = true;
                        platformInstance.stopProgressUpdates();

                        if (!platformInstance.handleVideoEnded()) {
                            if (typeof playNext === 'function') playNext();
                        }
                    }
                }

                // Detect track ended: was near end, now paused
                if (platformInstance.wasNearEnd && isPaused && !prevIsPaused) {
                    if (!platformInstance.trackEndedTriggered) {
                        platformInstance.wasNearEnd = false;
                        platformInstance.trackEndedTriggered = true;
                        platformInstance.stopProgressUpdates();

                        if (!platformInstance.handleVideoEnded()) {
                            if (typeof playNext === 'function') playNext();
                        }
                    }
                }

                // Detect position reset after being near end (Spotify restarted same track)
                if (platformInstance.wasNearEnd && position < 5000 && prevPosition >= duration - 3000) {
                    if (!platformInstance.trackEndedTriggered) {
                        platformInstance.wasNearEnd = false;
                        platformInstance.trackEndedTriggered = true;
                        platformInstance.stopProgressUpdates();

                        if (!platformInstance.handleVideoEnded()) {
                            if (typeof playNext === 'function') playNext();
                        }
                    }
                }

                // Update play button state
                const playBtn = document.getElementById("playBtn");
                const npPlayBtn = document.getElementById("npPlayBtn");
                if (isPaused) {
                    if (playBtn) playBtn.textContent = "▶️";
                    if (npPlayBtn) npPlayBtn.textContent = "▶️";
                    navigator.mediaSession.playbackState = 'paused';
                } else {
                    if (playBtn) playBtn.textContent = "⏸️";
                    if (npPlayBtn) npPlayBtn.textContent = "⏸️";
                    navigator.mediaSession.playbackState = 'playing';
                }

                platformInstance.updateProgress();
            });

            const displayName = platformInstance.getTitle();
            document.title = `${displayName} - PWA Player`;
            navigator.mediaSession.metadata = new MediaMetadata({
                title: displayName,
                artist: 'Spotify',
                album: 'Spotify'
            });

            const titleEl = document.querySelector("#nowPlayingInfo .track-title");
            const artistEl = document.querySelector("#nowPlayingInfo .track-artist");
            const urlEl = document.querySelector("#nowPlayingInfo .track-url");
            if (titleEl) titleEl.textContent = displayName;
            if (artistEl) artistEl.textContent = 'Spotify';
            if (urlEl) urlEl.textContent = platformInstance.getVideoUrl(videoId);

            platformInstance.startProgressUpdates(() => platformInstance.updateProgress());
        };

        IFrameAPI.createController(container, embedOptions, callback);
        window._pendingSpotifyData = null;
    }
};

// Register Spotify platform
registerPlatform(SpotifyPlatform);

// Legacy function names for backwards compatibility
window.extractSpotifyVideoId = SpotifyPlatform.extractVideoId;
window.isSpotifyUrl = (url) => SpotifyPlatform.isUrl(url);