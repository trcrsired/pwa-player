if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const newWorker = reg.installing;
      if (newWorker) {
        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
            const msg = t('newVersionAvailable', 'A new version of PWA Player is available.');
            const reload = t('reloadNow', 'Reload now?');
            if (confirm(`${msg}\n${reload}`)) {
              newWorker.postMessage("SKIP_WAITING");
            }
          }
        });
      }
    });
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });

  // Get version from service worker
  function getVersionFromSW() {
    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = (event) => {
        resolve(event.data?.version);
      };
      navigator.serviceWorker.controller?.postMessage("GET_VERSION", [messageChannel.port2]);
    });
  }

  // Store version globally when SW is ready
  navigator.serviceWorker.ready.then(async () => {
    if (navigator.serviceWorker.controller) {
      const version = await getVersionFromSW();
      if (version) {
        window.PWA_PLAYER_VERSION = version;
        // Update settings display if element exists
        const versionEl = document.getElementById("settingsVersion");
        if (versionEl) {
          versionEl.textContent = version;
        }
      }
    }
  });
}
