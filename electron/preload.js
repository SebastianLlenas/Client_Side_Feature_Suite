const {
    contextBridge,
    ipcRenderer
} = require("electron");
contextBridge.exposeInMainWorld("electron", {
    quit: () => ipcRenderer.send("quit"),
    addFullscreenChangeListener: e => ipcRenderer.on("fullscreen-change", (() => e())),
    isFullscreen: () => ipcRenderer.sendSync("is-fullscreen"),
    setFullscreen: e => ipcRenderer.send("set-fullscreen", e),
    openTasTool: () => ipcRenderer.send("open-tas-tool"),
    setTasRecording: e => {
        try {
            const t = "string" == typeof e ? e : e && e.serialize ? e.serialize() : "";
            ipcRenderer.send("tas-tool-set-recording", t)
        } catch {
            ipcRenderer.send("tas-tool-set-recording", "")
        }
    },
    tasToolApply: e => ipcRenderer.send("tas-tool-apply", e),
    onTasToolEncodedUpdate: e => ipcRenderer.on("tas-tool-encoded-update", ((t, ...n) => e(...n))),
    onTasToolApply: e => ipcRenderer.on("tas-tool-apply", ((t, ...n) => e(...n))),
    // Ghost list/visibility IPC for TAS Tool
    setTasGhosts: payload => ipcRenderer.send("tas-tool-set-ghosts", payload),
    onTasToolGhostsUpdate: cb => ipcRenderer.on("tas-tool-ghosts-update", ((evt, ...args) => cb(...args))),
    tasToolSetVisibility: visibleArray => ipcRenderer.send("tas-tool-set-visibility", visibleArray),
    onTasToolSetVisibility: cb => ipcRenderer.on("tas-tool-set-visibility", ((evt, ...args) => cb(...args))),
    // Request a ghost's recording to be loaded into TAS editor
    tasToolRequestLoad: index => ipcRenderer.send("tas-tool-request-load", index),
    onTasToolRequestLoad: cb => ipcRenderer.on("tas-tool-request-load", ((evt, ...args) => cb(...args))),
    tasToolHistoryUpdate: data => ipcRenderer.send("tas-tool-history-update", data),
    // File save/load for TAS scripts (human-readable)
    tasToolSaveToFile: text => ipcRenderer.invoke("tas-tool-save-to-file", text),
    tasToolLoadFromFile: () => ipcRenderer.invoke("tas-tool-load-from-file")
});

// Hook the "Enable TAS" button so it triggers the user's current keybind for EnableTas
window.addEventListener('DOMContentLoaded', () => {
    const getEnableTasCode = () => {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k) continue;
                const raw = localStorage.getItem(k);
                if (!raw) continue;
                let parsed;
                try {
                    parsed = JSON.parse(raw);
                } catch {
                    continue;
                }
                if (!Array.isArray(parsed)) continue;
                for (const entry of parsed) {
                    if (!Array.isArray(entry) || entry.length !== 2) continue;
                    const action = entry[0];
                    const bindings = entry[1];
                    if (action === 'EnableTas' && Array.isArray(bindings)) {
                        const [primary, secondary] = bindings;
                        if (typeof primary === 'string' && primary) return primary;
                        if (typeof secondary === 'string' && secondary) return secondary;
                    }
                }
            }
        } catch {}
        return null;
    };

    const triggerTasKey = () => {
        try {
            const code = getEnableTasCode();
            if (!code) return; // No EnableTas keybind set; let the button's own handler run
            const evt = new KeyboardEvent('keydown', {
                code,
                bubbles: true
            });
            window.dispatchEvent(evt);
        } catch {}
    };

    // Delegate click event to handle dynamically created button
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target && target.id === 'enable-tas-button') {
            triggerTasKey();
        }
    }, true);
});