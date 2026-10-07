let wakeLock = null;
const wakeBtn = document.getElementById('wakeLockBtn');

async function requestWakeLock() {
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        setIcon(wakeBtn, "lockOpen");
        wakeBtn.title = 'Disable Screen Awake';

        wakeLock.addEventListener('release', () => {
            setIcon(wakeBtn, "lock");
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
    setIcon(wakeBtn, "lock");
    wakeBtn.title = 'Keep Screen Awake';
}

wakeBtn.addEventListener('click', () => {
    if (wakeLock) {
        releaseWakeLock();
    } else {
        requestWakeLock();
    }
});
