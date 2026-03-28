let wakeLock = null;
const wakeBtn = document.getElementById('wakeLockBtn');

async function requestWakeLock() {
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeBtn.textContent = '🔓';
        wakeBtn.title = 'Disable Screen Awake';

        wakeLock.addEventListener('release', () => {
            wakeBtn.textContent = '🔒';
            wakeBtn.title = 'Keep Screen Awake';
        });
    } catch (err) {
        console.error('Wake Lock error:', err);
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
    wakeBtn.textContent = '🔒';
    wakeBtn.title = 'Keep Screen Awake';
}

wakeBtn.addEventListener('click', () => {
    if (wakeLock) {
        releaseWakeLock();
    } else {
        requestWakeLock();
    }
});
