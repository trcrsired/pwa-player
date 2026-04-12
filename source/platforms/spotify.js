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

    // Badge for display
    static getBadge() {
        return { label: 'Spotify', color: '#1db954' };
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

    // Check if URL is a Spotify playlist
    static isPlaylistUrl(url) {
        const videoId = this.extractVideoId(url);
        return videoId && videoId.type === 'playlist';
    }

    // Extract playlist ID from URL
    static extractPlaylistId(url) {
        const videoId = this.extractVideoId(url);
        if (videoId && videoId.type === 'playlist') {
            return videoId.id;
        }
        return null;
    }

    // Load Spotify playlist - fetches track list
    static async loadPlaylist(url) {
        const playlistId = this.extractPlaylistId(url);
        if (!playlistId) return null;

        const tracks = [];

        // Try embed page parsing
        try {
            const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}?utm_source=generator`;
            const response = await fetch(embedUrl);

            if (response.ok) {
                const html = await response.text();

                // Extract track IDs from various patterns
                const idSet = new Set();
                const uriPattern = /spotify:track:([a-zA-Z0-9]{22})/g;
                const urlPattern = /["\/]track[\/":]([a-zA-Z0-9]{22})/g;

                let match;
                while ((match = uriPattern.exec(html)) !== null) {
                    idSet.add(match[1]);
                }
                while ((match = urlPattern.exec(html)) !== null) {
                    idSet.add(match[1]);
                }

                // Try to extract names
                const namePattern = /"name":"([^"]{3,50})"/g;
                const names = [];
                while ((match = namePattern.exec(html)) !== null) {
                    const name = match[1];
                    if (!name.toLowerCase().includes('spotify') && !name.toLowerCase().includes('playlist')) {
                        names.push(name);
                    }
                }

                for (const id of idSet) {
                    tracks.push({
                        name: names[tracks.length] || `Spotify Track`,
                        path: `https://open.spotify.com/track/${id}`,
                        isUrl: true,
                        platform: this.name
                    });
                }
            }
        } catch (e) {
            console.warn("Spotify embed parse failed:", e);
        }

        if (tracks.length === 0) {
            throw new Error("Could not load Spotify playlist. Enable CORS bypass or add tracks manually.");
        }

        return tracks;
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
        this.wasNearEnd = false;
        this.lastPlayingURI = null;
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

    createPlayer(contentInfo, container, options = {}) {
        // Handle contentInfo - can be { type, id } object or string
        let videoId;
        if (typeof contentInfo === 'object') {
            // It's already { type, id } format
            videoId = contentInfo;
        } else if (typeof contentInfo === 'string') {
            // Legacy: just an ID string, assume track type
            videoId = { type: 'track', id: contentInfo };
        } else if (!contentInfo) {
            return null;
        }

        this.currentVideoId = videoId;
        this.pendingOptions = options;

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

            // Update playlist entry name if we have playlist info
            if (this.pendingOptions && this.pendingOptions.playlist) {
                const { playlistName, entryPath } = this.pendingOptions.playlist;
                if (playlistName && entryPath && typeof updatePlaylistEntryName === 'function') {
                    // Try to fetch track name from Spotify embed
                    this.fetchTrackName(videoId).then(trackName => {
                        if (trackName) {
                            // Skip update if entry already has a proper name
                            updatePlaylistEntryName(playlistName, entryPath, trackName, true).catch(e => {
                                console.warn('Failed to update playlist entry name:', e);
                            });
                        }
                    }).catch(() => {});
                }
            }

            // Update title - use entry name if it's a custom name (not a URL), otherwise generate title
            const entryName = this.pendingOptions?.entryName;
            const isEntryNameUrl = entryName && (entryName.startsWith('http://') || entryName.startsWith('https://') || entryName.startsWith('spotify:'));
            const displayName = entryName && !isEntryNameUrl
                ? entryName
                : this.getTitle();
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

    // Fetch track name from Spotify embed page
    async fetchTrackName(videoId) {
        if (!videoId) return null;

        let type, id;
        if (typeof videoId === 'object') {
            type = videoId.type;
            id = videoId.id;
        } else {
            type = 'track';
            id = videoId;
        }

        try {
            const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
            const response = await fetch(embedUrl);
            if (!response.ok) return null;

            const html = await response.text();
            // Try to extract track name from the embed page
            const titleMatch = html.match(/<title>([^<]+)\s*-\s*Spotify<\/title>/i);
            if (titleMatch && titleMatch[1]) {
                return titleMatch[1].trim();
            }
            // Alternative pattern
            const nameMatch = html.match(/"name":"([^"]+)"/);
            if (nameMatch && nameMatch[1] && !nameMatch[1].toLowerCase().includes('spotify')) {
                return nameMatch[1];
            }
        } catch (e) {
            console.warn('Failed to fetch Spotify track name:', e);
        }
        return null;
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

            // Use entry name if it's a custom name (not a URL), otherwise generate title
            const entryName = options?.entryName;
            const isEntryNameUrl = entryName && (entryName.startsWith('http://') || entryName.startsWith('https://') || entryName.startsWith('spotify:'));
            const displayName = entryName && !isEntryNameUrl
                ? entryName
                : platformInstance.getTitle();
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