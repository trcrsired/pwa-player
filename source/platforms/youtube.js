// ===============================
// YouTube Platform
// ===============================

class YouTubePlatform extends BasePlatform {
    static get name() {
        return 'youtube';
    }

    static get domains() {
        return [
            '*.youtube.com',
            'youtube.com',
            '*.youtube-nocookie.com',
            'youtube-nocookie.com',
            'youtu.be'
        ];
    }

    // Badge for display
    static getBadge() {
        return { label: 'YouTube', color: '#ff0000' };
    }

    // Extract video ID from URL
    static extractVideoId(url) {
        if (!url) return null;

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            // Match YouTube domains
            const isYouTubeDomain = hostname === 'youtube.com' || hostname.endsWith('.youtube.com') ||
                                     hostname === 'youtu.be' || hostname.endsWith('.youtu.be');

            if (!isYouTubeDomain) return null;

            // youtu.be/VIDEO_ID
            if (hostname === 'youtu.be' || hostname.endsWith('.youtu.be')) {
                return urlObj.pathname.slice(1).split('?')[0];
            }

            // youtube.com/watch?v=...
            if (urlObj.pathname === '/watch') {
                return urlObj.searchParams.get('v');
            }

            // /embed/VIDEO_ID or /v/VIDEO_ID or /short/VIDEO_ID
            if (urlObj.pathname.startsWith('/embed/') ||
                urlObj.pathname.startsWith('/v/') ||
                urlObj.pathname.startsWith('/shorts/') ||
                urlObj.pathname.startsWith('/live/') ||
                urlObj.pathname.startsWith('/short/')
                ) {
                return urlObj.pathname.split('/')[2]?.split('?')[0];
            }
        } catch (e) {
            return null;
        }

        return null;
    }

    // Check if URL is a YouTube playlist
    static isPlaylistUrl(url) {
        return this.extractPlaylistId(url) !== null;
    }

    // Extract playlist ID from URL
    static extractPlaylistId(url) {
        if (!url) return null;

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            // Match any YouTube domain (youtube.com, www.youtube.com, m.youtube.com, etc.)
            if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname === 'youtu.be') {
                // youtube.com/playlist?list=PLAYLIST_ID
                if (urlObj.pathname === '/playlist') {
                    return urlObj.searchParams.get('list');
                }
                // youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID
                if (urlObj.pathname === '/watch') {
                    return urlObj.searchParams.get('list');
                }
            }
        } catch (e) {
            return null;
        }

        return null;
    }

    // Load YouTube playlist - IFrame API handles playlists via list parameter
    // Just return the playlist URL as a single entry
    static async loadPlaylist(url) {
        const playlistId = this.extractPlaylistId(url);
        if (!playlistId) return null;

        // YouTube IFrame API handles playlist playback natively
        // Return single entry - player will use list parameter
        return [{
            name: `YouTube Playlist (${playlistId})`,
            path: url,
            isUrl: true,
            isPlaylist: true,
            playlistId: playlistId,
            platform: this.name
        }];
    }

    // Extract either video ID or playlist info
    static extractContentInfo(url) {
        const videoId = this.extractVideoId(url);
        const playlistId = this.extractPlaylistId(url);

        if (playlistId && videoId) {
            // Video within a playlist
            return { type: 'video-in-playlist', videoId, playlistId };
        } else if (playlistId) {
            // Pure playlist URL
            return { type: 'playlist', playlistId };
        } else if (videoId) {
            // Single video
            return { type: 'video', videoId };
        }
        return null;
    }

    loadApi() {
        if (this.apiReady || this.apiLoading) return;

        this.apiLoading = true;

        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    createPlayer(contentInfo, container, options = {}) {
        // Handle both string (video ID) and object (content info)
        if (typeof contentInfo === 'string') {
            contentInfo = { type: 'video', videoId: contentInfo };
        } else if (!contentInfo) {
            return null;
        }

        this.currentContentInfo = contentInfo;
        this.pendingOptions = options;

        if (!window._ytApiReady) {
            this.loadApi();
            // Store this instance for callback
            window._pendingYouTubeInstance = this;
            window._pendingYouTubeContentInfo = contentInfo;
            window._pendingYouTubeContainer = container;
            return null;
        }

        // Check play mode for looping
        const playMode = typeof getPlayMode === 'function' ? getPlayMode() : 'once';
        const shouldLoop = playMode === 'repeat-one';

        // Build playerVars
        const playerVars = {
            'playsinline': 1,
            'autoplay': 1,
            'controls': 1,
            'modestbranding': 1,
            'rel': 0,
            'fs': 1,
            'iv_load_policy': 3
        };

        // Whether to follow the playlist carried inside the URL itself
        const useUrlPlaylist = typeof isUrlPlaylistEnabled === 'function' ? isUrlPlaylistEnabled() : false;
        this.urlPlaylistActive = false;
        this.convertToSingleVideo = false;

        // A watch?v=ID&list=ID URL degrades to a single video when the
        // URL playlist feature is off
        if (contentInfo.type === 'video-in-playlist' && !useUrlPlaylist) {
            contentInfo = { type: 'video', videoId: contentInfo.videoId };
            this.currentContentInfo = contentInfo;
        }

        // Configure based on content type
        let playerConfig;

        if (contentInfo.type === 'playlist') {
            // Load entire playlist using YouTube's built-in playlist support
            playerVars.listType = 'playlist';
            playerVars.list = contentInfo.playlistId;

            if (useUrlPlaylist) {
                this.urlPlaylistActive = true;
            } else {
                // Load once to discover items, then collapse to the first video
                this.convertToSingleVideo = true;
            }

            playerConfig = {
                height: '100%',
                width: '100%',
                playerVars: playerVars,
                events: {
                    'onReady': (event) => this.onReady(event, this.pendingOptions),
                    'onStateChange': (event) => this.onStateChange(event, this.pendingOptions),
                    'onError': (event) => this.onError(event, this.pendingOptions)
                }
            };
        } else if (contentInfo.type === 'video-in-playlist') {
            // Pass videoId together with list/listType so playback starts at
            // the selected video and YouTube continues through the playlist
            playerVars.listType = 'playlist';
            playerVars.list = contentInfo.playlistId;
            this.urlPlaylistActive = true;

            playerConfig = {
                height: '100%',
                width: '100%',
                videoId: contentInfo.videoId,
                playerVars: playerVars,
                events: {
                    'onReady': (event) => this.onReady(event, this.pendingOptions),
                    'onStateChange': (event) => this.onStateChange(event, this.pendingOptions),
                    'onError': (event) => this.onError(event, this.pendingOptions)
                }
            };
        } else {
            // Single video
            if (shouldLoop) {
                playerVars['loop'] = 1;
                playerVars['playlist'] = contentInfo.videoId;
            }

            playerConfig = {
                height: '100%',
                width: '100%',
                videoId: contentInfo.videoId,
                playerVars: playerVars,
                events: {
                    'onReady': (event) => this.onReady(event, this.pendingOptions),
                    'onStateChange': (event) => this.onStateChange(event, this.pendingOptions),
                    'onError': (event) => this.onError(event, this.pendingOptions)
                }
            };
        }

        this.player = new YT.Player(container, playerConfig);

        return this.player;
    }

    onReady(event, options) {
        // URL playlist disabled: the embed was only loaded to discover the
        // playlist contents. The actual collapse happens in onStateChange
        // once the video is PLAYING — only then is getVideoData() reliably
        // populated with the video the user is actually watching.
        if (this.convertToSingleVideo) {
            // Safety: if playback never starts, stop rather than leave the
            // whole YouTube playlist armed
            setTimeout(() => {
                if (this.convertToSingleVideo) {
                    this.convertToSingleVideo = false;
                    try { this.player.stopVideo(); } catch (e) {}
                }
            }, 8000);
            if (options.onReady) options.onReady(event);
            return;
        }

        event.target.playVideo();

        // Resume position after a rebuild (single-video conversion)
        if (this.resumeTime) {
            try { this.player.seekTo(this.resumeTime, true); } catch (e) {}
            this.resumeTime = 0;
        }

        // Set volume from stored preference
        const storedVolume = localStorage.getItem('volume');
        if (storedVolume) {
            const vol = parseInt(storedVolume, 10);
            this.player.setVolume(vol);
            const volumeSlider = document.getElementById("volumeSlider");
            const npVolumeSlider = document.getElementById("npVolumeSlider");
            if (volumeSlider) volumeSlider.value = vol;
            if (npVolumeSlider) npVolumeSlider.value = vol;
        }

        // Update title and Now Playing info
        const videoData = this.player.getVideoData();
        const videoId = videoData?.video_id || this.currentVideoId || '';
        const videoUrl = this.getVideoUrl(videoId);

        if (videoData && videoData.title) {
            // Use custom entry name if it's not a URL, otherwise use YouTube title
            const entryName = this.pendingOptions?.entryName;
            const isEntryNameUrl = entryName && (entryName.startsWith('http://') || entryName.startsWith('https://'));
            const displayTitle = entryName && !isEntryNameUrl
                ? entryName
                : videoData.title;

            document.title = displayTitle;
            navigator.mediaSession.metadata = new MediaMetadata({
                title: displayTitle,
                artist: videoData.author || 'YouTube',
                album: 'YouTube'
            });

            const titleEl = document.querySelector("#nowPlayingInfo .track-title");
            const artistEl = document.querySelector("#nowPlayingInfo .track-artist");
            const urlEl = document.querySelector("#nowPlayingInfo .track-url");
            if (titleEl) titleEl.textContent = displayTitle;
            if (artistEl) artistEl.textContent = videoData.author || 'YouTube';
            if (urlEl) urlEl.textContent = videoUrl;

            // Update playlist entry with fetched title if we have playlist info
            // Only update for single videos, not for YouTube playlist entries (which represent multiple videos)
            // Also skip if the entry already has a name (don't update again)
            if (this.pendingOptions && this.pendingOptions.playlist && this.currentContentInfo?.type !== 'playlist') {
                const { playlistName, entryPath } = this.pendingOptions.playlist;
                if (playlistName && entryPath && typeof updatePlaylistEntryName === 'function') {
                    updatePlaylistEntryName(playlistName, entryPath, videoData.title, true).catch(e => {
                        console.warn('Failed to update playlist entry name:', e);
                    });
                }
            }
        }

        // Start progress updates
        this.startProgressUpdates(() => this.updateProgress());

        // Callback
        if (options.onReady) options.onReady(event);
    }

    // Rebuild the embed as a plain single-video player (no list params) so
    // YouTube cannot continue into the rest of the URL playlist
    recreateAsSingleVideo(videoId) {
        try {
            const parent = this.player.getIframe().parentNode;
            if (!parent) return false;
            this.player.destroy();
            const div = document.createElement('div');
            parent.appendChild(div);
            this.createPlayer({ type: 'video', videoId }, div, this.pendingOptions);
            return true;
        } catch (e) {
            console.warn("Could not rebuild player as single video:", e);
            return false;
        }
    }

    onStateChange(event, options) {
        // URL playlist disabled: once the playlist embed actually starts
        // playing a video, rebuild as a single-video player for exactly
        // that video (PLAYING = getVideoData is finally reliable)
        if (this.convertToSingleVideo && event.data === YT.PlayerState.PLAYING) {
            this.convertToSingleVideo = false;
            try {
                const data = this.player.getVideoData && this.player.getVideoData();
                const videoId = data && data.video_id;
                const t = this.player.getCurrentTime ? this.player.getCurrentTime() : 0;
                if (videoId && this.recreateAsSingleVideo(videoId)) {
                    this.resumeTime = t;
                } else {
                    this.player.stopVideo();
                }
            } catch (e) {
                try { this.player.stopVideo(); } catch (e2) {}
            }
            if (options.onStateChange) options.onStateChange(event);
            return;
        }

        const playBtn = document.getElementById("playBtn");
        const npPlayBtn = document.getElementById("npPlayBtn");

        if (event.data === YT.PlayerState.PLAYING) {
            if (playBtn) setIcon(playBtn, "pause");
            if (npPlayBtn) setIcon(npPlayBtn, "pause");
            navigator.mediaSession.playbackState = 'playing';

            if (!this.progressInterval) {
                this.startProgressUpdates(() => this.updateProgress());
            }
        } else if (event.data === YT.PlayerState.PAUSED) {
            if (playBtn) setIcon(playBtn, "play");
            if (npPlayBtn) setIcon(npPlayBtn, "play");
            navigator.mediaSession.playbackState = 'paused';
        } else if (event.data === YT.PlayerState.ENDED) {
            if (playBtn) setIcon(playBtn, "play");
            if (npPlayBtn) setIcon(npPlayBtn, "play");
            navigator.mediaSession.playbackState = 'paused';

            this.stopProgressUpdates();

            if (this.urlPlaylistActive) {
                // YouTube advances its own playlist internally — an ENDED here
                // is usually just a track transition. Wait a beat and only
                // hand off to our playlist if playback has truly stopped.
                setTimeout(() => {
                    try {
                        const state = this.player && this.player.getPlayerState ? this.player.getPlayerState() : -1;
                        if (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) return;
                    } catch (e) { /* fall through to normal handling */ }
                    if (!this.handleVideoEnded()) {
                        if (typeof playNext === 'function') playNext();
                    }
                }, 400);
            } else {
                // Defensive: if this embed still has a multi-item playlist
                // context (conversion pending or failed), stop it now so
                // YouTube cannot auto-advance into the next video
                try {
                    const list = this.player.getPlaylist && this.player.getPlaylist();
                    if (list && list.length > 1) this.player.stopVideo();
                } catch (e) {}
                if (!this.handleVideoEnded()) {
                    if (typeof playNext === 'function') playNext();
                }
            }
        }

        if (options.onStateChange) options.onStateChange(event);
    }

    onError(event, options) {
        const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;

        let errorMsg = t('youtubeError', 'YouTube playback error');

        switch (event.data) {
            case 2:
                errorMsg = t('youtubeInvalidId', 'Invalid YouTube video ID');
                break;
            case 5:
                errorMsg = t('youtubeHtml5Error', 'YouTube HTML5 player error');
                break;
            case 100:
                errorMsg = t('youtubeNotFound', 'YouTube video not found or removed');
                break;
            case 101:
            case 150:
                errorMsg = t('youtubeNotAllowed', 'YouTube video not allowed to be embedded');
                break;
        }

        alert(errorMsg);

        if (options.onError) options.onError(event, errorMsg);
    }

    updateProgress() {
        if (!this.player || !this.player.getCurrentTime || !this.player.getDuration) return;

        const currentTime = this.player.getCurrentTime();
        const duration = this.player.getDuration();

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
        const isDraggingProgressBar = window.isDraggingProgressBar;
        if (!isDraggingProgressBar) {
            if (progressBar) progressBar.value = percent;
            if (npProgressBar) npProgressBar.value = percent;
        }

        const timeText = `${formatEmbedTime(currentTime)} / ${formatEmbedTime(duration)}`;
        if (timeDisplay && !window.timeInputActive) timeDisplay.textContent = timeText;
        if (npTimeDisplay && !window.npTimeInputActive) npTimeDisplay.textContent = timeText;
    }

    destroyPlayerInternal() {
        if (this.player) {
            this.player.stopVideo();
            this.player.destroy();
        }
    }

    play() {
        if (this.player) this.player.playVideo();
    }

    pause() {
        if (this.player) this.player.pauseVideo();
    }

    togglePlayPause() {
        if (!this.player) return;
        const state = this.player.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
            this.pause();
        } else {
            this.play();
        }
    }

    stop() {
        if (this.player) {
            this.player.stopVideo();
        }
        this.destroyPlayer();
    }

    seekToPercent(percent) {
        if (!this.player || !this.player.getDuration) return;
        const duration = this.player.getDuration();
        this.seekToTime((percent / 100) * duration);
    }

    seekToTime(seconds) {
        if (this.player) this.player.seekTo(seconds, true);
    }

    setVolume(percent) {
        if (this.player) this.player.setVolume(percent);
        localStorage.setItem('volume', percent.toString());
    }

    getCurrentTime() {
        if (this.player && this.player.getCurrentTime) {
            return this.player.getCurrentTime();
        }
        return 0;
    }

    getDuration() {
        if (this.player && this.player.getDuration) {
            return this.player.getDuration();
        }
        return 0;
    }

    getTitle() {
        if (this.player && this.player.getVideoData) {
            const data = this.player.getVideoData();
            return data?.title || null;
        }
        return null;
    }

    getVideoUrl(videoId) {
        return videoId ? `https://www.youtube.com/watch?v=${videoId}` : 'YouTube';
    }

    isPlaying() {
        if (this.player && this.player.getPlayerState) {
            return this.player.getPlayerState() === YT.PlayerState.PLAYING;
        }
        return false;
    }
}

// Register YouTube platform
registerPlatform(YouTubePlatform);

// YouTube API callback (global)
function onYouTubeIframeAPIReady() {
    window._ytApiReady = true;

    // If there's a pending instance, finish creating its player through the
    // normal path (which applies the URL-playlist setting and flags)
    if (window._pendingYouTubeInstance && window._pendingYouTubeContentInfo) {
        const instance = window._pendingYouTubeInstance;
        const contentInfo = window._pendingYouTubeContentInfo;
        const container = window._pendingYouTubeContainer || 'embeddedPlayer';

        window._pendingYouTubeInstance = null;
        window._pendingYouTubeContentInfo = null;
        window._pendingYouTubeContainer = null;

        instance.createPlayer(contentInfo, container, instance.pendingOptions || {});
    }
}

// Make globally accessible for YouTube API
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

// Legacy function names for backwards compatibility
window.extractYouTubeVideoId = YouTubePlatform.extractVideoId;
window.isYouTubeUrl = YouTubePlatform.isUrl;
