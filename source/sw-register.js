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
            const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
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
}
