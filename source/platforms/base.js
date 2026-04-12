// ===============================
// Base Platform Interface
// ===============================

// Base class for embedded video platforms
class BasePlatform {
    constructor() {
        this.player = null;
        this.progressInterval = null;
        this.apiReady = false;
        this.apiLoading = false;
        this.currentVideoId = null;
    }

    // Platform identification
    static get name() {
        throw new Error('Platform must implement static get name');
    }

    static get domains() {
        throw new Error('Platform must implement static get domains');
    }

    // Check if URL belongs to this platform
    static isUrl(url) {
        if (!url) return false;
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;
            return this.domains.some(domain => {
                if (domain.startsWith('*.')) {
                    const baseDomain = domain.slice(2);
                    return hostname === baseDomain || hostname.endsWith('.' + baseDomain);
                }
                return hostname === domain;
            });
        } catch (e) {
            return false;
        }
    }

    // Extract video ID from URL
    static extractVideoId(url) {
        throw new Error('Platform must implement static extractVideoId');
    }

    // Load platform API
    loadApi() {
        throw new Error('Platform must implement loadApi');
    }

    // Create player
    createPlayer(videoId, container, options = {}) {
        throw new Error('Platform must implement createPlayer');
    }

    // Destroy player
    destroyPlayer() {
        if (this.player) {
            this.destroyPlayerInternal();
            this.player = null;
        }
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
        this.currentVideoId = null;
    }

    // Internal destroy implementation (platform-specific)
    destroyPlayerInternal() {
        throw new Error('Platform must implement destroyPlayerInternal');
    }

    // Play
    play() {
        throw new Error('Platform must implement play');
    }

    // Pause
    pause() {
        throw new Error('Platform must implement pause');
    }

    // Toggle play/pause
    togglePlayPause() {
        throw new Error('Platform must implement togglePlayPause');
    }

    // Stop
    stop() {
        throw new Error('Platform must implement stop');
    }

    // Seek to percentage
    seekToPercent(percent) {
        throw new Error('Platform must implement seekToPercent');
    }

    // Seek to time in seconds
    seekToTime(seconds) {
        throw new Error('Platform must implement seekToTime');
    }

    // Set volume (0-100)
    setVolume(percent) {
        throw new Error('Platform must implement setVolume');
    }

    // Get current time
    getCurrentTime() {
        throw new Error('Platform must implement getCurrentTime');
    }

    // Get duration
    getDuration() {
        throw new Error('Platform must implement getDuration');
    }

    // Get video title
    getTitle() {
        throw new Error('Platform must implement getTitle');
    }

    // Get video URL for display
    getVideoUrl(videoId) {
        throw new Error('Platform must implement getVideoUrl');
    }

    // Check if playing
    isPlaying() {
        throw new Error('Platform must implement isPlaying');
    }

    // Get play mode and handle video ended
    handleVideoEnded() {
        const playMode = typeof getPlayMode === 'function' ? getPlayMode() : 'once';

        if (playMode === 'repeat-one') {
            this.seekToTime(0);
            this.play();
            return true;
        }

        // Call the global handler for playlist continuation
        if (typeof handleEmbeddedVideoEnded === 'function') {
            handleEmbeddedVideoEnded();
            return true;
        }

        return false; // Let caller handle next item
    }

    // Start progress updates
    startProgressUpdates(callback, interval = 500) {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        this.progressInterval = setInterval(callback, interval);
    }

    // Stop progress updates
    stopProgressUpdates() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }
}

// Platform registry
const platformRegistry = new Map();

// Register a platform
function registerPlatform(platformClass) {
    platformRegistry.set(platformClass.name, platformClass);
}

// Get platform for URL
function getPlatformForUrl(url) {
    for (const [, platformClass] of platformRegistry) {
        if (platformClass.isUrl(url)) {
            return platformClass;
        }
    }
    return null;
}

// Get platform instance by name
function getPlatformInstance(name) {
    const platformClass = platformRegistry.get(name);
    if (!platformClass) return null;
    return new platformClass();
}

// Check if URL is any embedded URL
function isEmbeddedUrl(url) {
    return getPlatformForUrl(url) !== null;
}

// Format time for display (shared utility)
function formatEmbedTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Export for use in other modules
window.BasePlatform = BasePlatform;
window.registerPlatform = registerPlatform;
window.getPlatformForUrl = getPlatformForUrl;
window.getPlatformInstance = getPlatformInstance;
window.isEmbeddedUrl = isEmbeddedUrl;
window.formatEmbedTime = formatEmbedTime;