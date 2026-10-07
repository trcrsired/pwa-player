// dialog.js — glass modal dialogs replacing native alert/confirm/prompt
// and providing a button-list option picker. All helpers return Promises;
// window.alert is overridden globally so every alert() gets glass styling.

const nativeAlert = window.alert.bind(window);

function dt(key, params) {
    return window.i18n ? window.i18n.t(key, params) : key;
}

// Core dialog. options: { title, message, input: {value, placeholder},
// buttons: [{label, value, primary, danger}], stack, cancelValue }
function glassDialog(opts) {
    return new Promise((resolve) => {
        if (!document.body) { resolve(opts.cancelValue); return; }

        const backdrop = document.createElement("div");
        backdrop.className = "glass-dialog-backdrop";

        const dlg = document.createElement("div");
        dlg.className = "glass-dialog";
        dlg.setAttribute("role", "dialog");
        dlg.tabIndex = -1;

        if (opts.title) {
            const h = document.createElement("div");
            h.className = "glass-dialog-title";
            h.textContent = opts.title;
            dlg.appendChild(h);
        }

        if (opts.message) {
            const msg = document.createElement("div");
            msg.className = "glass-dialog-msg";
            msg.textContent = opts.message;
            dlg.appendChild(msg);
        }

        let inputEl = null;
        if (opts.input) {
            inputEl = document.createElement("input");
            inputEl.type = "text";
            inputEl.className = "glass-dialog-input";
            inputEl.value = opts.input.value || "";
            if (opts.input.placeholder) inputEl.placeholder = opts.input.placeholder;
            dlg.appendChild(inputEl);
        }

        // value === true on an input dialog resolves the typed text
        const close = (value) => {
            window.removeEventListener("keydown", onKey, true);
            backdrop.remove();
            resolve(value === true && inputEl ? inputEl.value : value);
        };

        const btns = document.createElement("div");
        btns.className = "glass-dialog-btns" + (opts.stack ? " stack" : "");
        let primaryBtn = null;
        opts.buttons.forEach((b) => {
            const el = document.createElement("button");
            el.className = "dlg-btn" + (b.primary ? " primary" : "") + (b.danger ? " danger" : "");
            el.textContent = b.label;
            el.addEventListener("click", () => close(b.value));
            if (b.primary) primaryBtn = el;
            btns.appendChild(el);
        });
        dlg.appendChild(btns);

        const onKey = (e) => {
            if (e.code === "Escape") {
                e.stopPropagation();
                e.preventDefault();
                close(opts.cancelValue);
            } else if (e.code === "Enter" && primaryBtn && e.target.tagName !== "BUTTON") {
                e.stopPropagation();
                e.preventDefault();
                close(opts.buttons.find(b => b.primary).value);
            }
        };
        window.addEventListener("keydown", onKey, true);

        backdrop.addEventListener("pointerdown", (e) => {
            if (e.target === backdrop) close(opts.cancelValue);
        });

        backdrop.appendChild(dlg);
        document.body.appendChild(backdrop);
        (inputEl || primaryBtn || dlg).focus();
        if (inputEl) inputEl.select();
    });
}

function glassAlert(msg) {
    return glassDialog({
        message: String(msg),
        cancelValue: true,
        buttons: [{ label: dt('ok', 'OK'), value: true, primary: true }]
    });
}

function glassConfirm(msg) {
    return glassDialog({
        message: String(msg),
        cancelValue: false,
        buttons: [
            { label: dt('cancel', 'Cancel'), value: false },
            { label: dt('confirm', 'Confirm'), value: true, primary: true }
        ]
    }).then(v => v === true);
}

function glassPrompt(msg, def = "") {
    return glassDialog({
        message: String(msg),
        input: { value: def },
        cancelValue: null,
        buttons: [
            { label: dt('cancel', 'Cancel'), value: null },
            { label: dt('confirm', 'Confirm'), value: true, primary: true }
        ]
    }).then(v => (v === null ? null : String(v)));
}

// Vertical button list picker → resolves the option index or null
function pickOption(title, options) {
    const buttons = options.map((label, i) => ({ label, value: i }));
    buttons.push({ label: dt('cancel', 'Cancel'), value: -1 });
    return glassDialog({ title, buttons, stack: true, cancelValue: -1 })
        .then(i => (i >= 0 ? i : null));
}

window.glassAlert = glassAlert;
window.glassConfirm = glassConfirm;
window.glassPrompt = glassPrompt;
window.pickOption = pickOption;

// Route all legacy alert() calls through the glass dialog (non-blocking;
// alert's return value is unused everywhere in this codebase)
window.alert = function (msg) { glassAlert(msg); };
