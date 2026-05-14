const {
    app,
    BrowserWindow,
    shell,
    ipcMain,
    dialog
} = require("electron"), path = require("path"), zlib = require("zlib"), fs = require("fs");
let browserWindow = null,
    tasWindow = null,
    lastTasRecording = null,
    lastTasGhosts = null,
    tasHistory = null,
    tasHistoryIndex = -1;
const singleInstanceLockSucessful = app.requestSingleInstanceLock();

function decodeTasRecording(e) {
    try {
        if ("string" != typeof e || !e) return null;
        let t = e.replace(/-/g, "+").replace(/_/g, "/");
        const n = t.length % 4;
        n && (t += "=".repeat(4 - n));
        const i = Buffer.from(t, "base64"),
            r = zlib.inflateSync(i);
        if (!r) return null;
        const a = new Uint8Array(r);
        let s = 0;

        function o() {
            if (s + 3 > a.length) return null;
            const e = a[s] | a[s + 1] << 8 | a[s + 2] << 16;
            s += 3;
            const t = new Array(e);
            let n = 0;
            for (let i = 0; i < e; i++) {
                if (s + 3 > a.length) return null;
                const e = a[s] | a[s + 1] << 8 | a[s + 2] << 16;
                s += 3, n = 0 === i ? e : n + e, t[i] = n
            }
            return t
        }
        const l = o();
        if (null == l) return null;
        const c = o();
        if (null == c) return null;
        const d = o();
        if (null == d) return null;
        const u = o();
        if (null == u) return null;
        const f = o();
        return null == f ? null : {
            up: l,
            right: c,
            down: d,
            left: u,
            reset: f
        }
    } catch {
        return null
    }
}

function formatTasHuman(e) {
    try {
        if (!e) return "";
        const r = ["up", "left", "down", "right", "reset"],
            t = {
                up: "w",
                left: "a",
                down: "s",
                right: "d",
                reset: "r",
            },
            n = {},
            i = new Set;
        for (const o of r) {
            const a = e[o] || [],
                s = new Set(a);
            n[o] = s;
            for (let l = 0; l < a.length; l++) i.add(a[l])
        }
        const c = Array.from(i).sort(((e, r) => e - r)),
            u = {
                up: !1,
                left: !1,
                down: !1,
                right: !1,
                reset: !1,
            },
            d = [];
        for (let f = 0; f < c.length; f++) {
            const h = c[f];
            for (const p of r) n[p].has(h) && (u[p] = !u[p]);
            let g = "";
            for (const v of r) u[v] && (g += t[v]);
            d.push(h + "," + g)
        }
        return d.join("\n")
    } catch {
        return ""
    }
}

function parseTasHuman(e) {
    try {
        const t = e.split("\n").map((line => {
                const i = line.indexOf("#");
                return i >= 0 ? line.slice(0, i) : line;
            })).filter((e => "" !== e.trim())),
            n = [];
        for (const i of t) {
            const e = i.split(",");
            if (2 !== e.length) continue;
            const r = parseInt(e[0], 10),
                a = e[1].trim();
            if (isNaN(r)) continue;
            n.push({
                frame: r,
                keys: a
            })
        }
        const i = {
                w: "up",
                a: "left",
                s: "down",
                d: "right",
                r: "reset"
            },
            r = {
                up: [],
                right: [],
                down: [],
                left: [],
                reset: []
            },
            a = {
                up: !1,
                left: !1,
                down: !1,
                right: !1,
                reset: !1,
            };
        let s = -1;
        for (const o of n) {
            if (o.frame <= s) continue;
            const l = {
                up: !1,
                left: !1,
                down: !1,
                right: !1,
                reset: !1,
            };
            for (const c of o.keys) {
                const e = i[c];
                e && (l[e] = !0)
            }
            for (const d in a) a[d] !== l[d] && r[d].push(o.frame);
            Object.assign(a, l), s = o.frame
        }
        return r
    } catch (e) {
        return console.error("Failed to parse human-readable TAS input:", e), null
    }
}

function encodeTasRecording(e) {
    try {
        if (!e) return null;
        const t = [],
            n = ["up", "right", "down", "left", "reset"];
        for (const i of n) {
            const n = e[i] || [],
                r = Buffer.alloc(3 + 3 * n.length);
            r.writeUIntLE(n.length, 0, 3);
            let a = 0;
            for (let s = 0; s < n.length; s++) {
                const e = n[s] - a;
                r.writeUIntLE(e, 3 + 3 * s, 3), a = n[s]
            }
            t.push(r)
        }
        const i = Buffer.concat(t),
            r = zlib.deflateSync(i);
        let a = r.toString("base64");
        return a = a.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""), a
    } catch (e) {
        return console.error("Failed to encode TAS recording:", e), null
    }
}

function ensureTasWindow() {
    if (null == tasWindow || tasWindow.isDestroyed()) {
        tasWindow = new BrowserWindow({
            width: 1280,
            height: 720,
            resizable: !0,
            autoHideMenuBar: !0,
            title: "TAS Tool",
            webPreferences: {
                devTools: !1,
                backgroundThrottling: !1,
                preload: path.join(__dirname, "preload.js")
            }
        }), tasWindow.on("closed", (() => {
            tasWindow = null
        }))
    }
    tasWindow.setTitle("TAS Tool"), tasWindow.show(), tasWindow.focus();
    /*
    const tasHtml = '<!doctype html><title>TAS Tool</title><style>body{margin:0;font-family:sans-serif;background:#1e1e28;color:#eee;height:100vh;display:flex;flex-direction:column}header{padding:12px 16px;border-bottom:1px solid #2a2a3a}main{padding:16px;display:flex;flex-direction:column;gap:12px}label{font-size:12px;color:#bbb}textarea{width:100%;height:180px;background:#0f0f17;color:#eee;border:1px solid #2a2a3a;border-radius:6px;padding:10px;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;font-size:12px;resize:vertical}button{background:#3842d0;border:none;color:#fff;border-radius:6px;padding:8px 12px;font-size:13px;cursor:pointer;align-self:flex-start}button:disabled{opacity:.6;cursor:default}.row{display:flex;gap:8px;align-items:center}.ghosts{border:1px solid #2a2a3a;border-radius:6px;padding:8px}.ghosts h2{margin:0 0 6px 0;font-size:13px;color:#bbb}.ghosts-list{display:flex;flex-direction:column;gap:6px}.ghost-item{display:flex;gap:8px;align-items:center}.ghost-item input[type=checkbox]{width:14px;height:14px}</style><header><h1 style="margin:0;font-weight:600;font-size:16px">TAS Tool</h1></header><main><div class="ghosts"><h2>Ghosts</h2><div class="row" style="gap:6px"><button id="gh-show-all">Show all</button><button id="gh-hide-all">Hide all</button></div><div id="ghosts" class="ghosts-list"></div></div><div><label>Current ghost encoded input</label><textarea id="encoded" placeholder="No ghost loaded yet"></textarea></div><div><label>Decoded (human-readable)</label><div class="findbar" id="findbar" style="display:none;gap:8px;align-items:center;margin:4px 0"><input id="find" placeholder="Find..." style="width:100%;background:#0f0f17;color:#eee;border:1px solid #2a2a3a;border-radius:6px;padding:6px 10px;font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \'Liberation Mono\', \'Courier New\', monospace;font-size:12px;"><span id="find-count" style="font-size:12px;color:#bbb;margin:0 4px"></span><button id="find-prev">Prev</button><button id="find-next">Next</button><button id="find-close">Close</button></div><textarea id="decoded" placeholder="Decoded ghost input"></textarea></div><div style="display: flex; gap: 8px; align-items: center;"><input id="command" placeholder="e.g., tap 1150 1205 wd 10 5" style="width: 100%; background: #0f0f17; color: #eee; border: 1px solid #2a2a3a; border-radius: 6px; padding: 8px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \'Liberation Mono\', \'Courier New\', monospace; font-size: 12px;"><button id="execute" style="flex-shrink: 0;">Execute Command</button></div><div style="display:flex;gap:8px;align-items:center;margin-top:4px"><input id="offset-ms" type="number" placeholder="Offset selected (ms)" style="width:160px;background:#0f0f17;color:#eee;border:1px solid #2a2a3a;border-radius:6px;padding:8px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,\'Liberation Mono\',\'Courier New\',monospace;font-size:12px;"><button id="offset-apply">Apply Offset</button></div><div style="display:flex;gap:8px"><button id="copy">Copy</button><button id="clear">Clear</button><button id="apply">Apply</button></div></main><script>var $=function(e){return document.getElementById(e)};var setVal=function(v){$("encoded").value=v||""};var setHuman=function(v){var d=$("decoded");if(d){d.value=v||"";d.textContent=v||""}};function renderGhosts(data){try{var root=$("ghosts");if(!root)return;root.textContent="";if(!data||!Array.isArray(data.names))return;var names=data.names||[];var sel=typeof data.selected==="number"?data.selected:-1;var vis=Array.isArray(data.visibility)?data.visibility.map(v=>v!==false):names.map(()=>true);names.forEach(function(name,idx){var row=document.createElement(\'div\');row.className=\'ghost-item\';var cb=document.createElement(\'input\');cb.type=\'checkbox\';cb.checked=!!vis[idx];cb.disabled=(idx===sel);cb.addEventListener(\'change\',function(){vis[idx]=cb.checked;try{window.electron.tasToolSetVisibility(vis);}catch(e){}});var lab=document.createElement(\'span\');lab.textContent=(idx===sel?\'[TAS] \':\'\')+name;row.appendChild(cb);row.appendChild(lab);root.appendChild(row);});var sh=$("gh-show-all"), hd=$("gh-hide-all");if(sh) sh.onclick=function(){for(var i=0;i<vis.length;i++){vis[i]=true}try{window.electron.tasToolSetVisibility(vis)}catch(e){}};if(hd) hd.onclick=function(){for(var i=0;i<vis.length;i++){if(i!==sel)vis[i]=false}try{window.electron.tasToolSetVisibility(vis)}catch(e){}};}catch(e){}}window.addEventListener("DOMContentLoaded",function(){setVal(window.__tasEncoded||"");setHuman(window.__tasDecoded||"");window.electron.onTasToolGhostsUpdate(function(payload){try{renderGhosts(payload)}catch(e){}});if(window.__tasGhosts){try{renderGhosts(window.__tasGhosts)}catch(e){}}$("copy").onclick=function(){var t=$("decoded");if(window.navigator&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t.value).catch(function(){})}else{try{t.select();document.execCommand("copy")}catch(e){}}};$("clear").onclick=function(){setVal("");setHuman("")};$("apply").onclick=function(){var t=$("decoded").value;window.electron.tasToolApply(t)};$("execute").onclick=function(){const t=$("command").value.trim();if(!t.startsWith("tap "))return;const e=t.split(/\\s+/);if(6!==e.length)return;const n=e.map(((t,e)=>e>0&&3!==e?parseInt(t,10):t)),r=n[1],a=n[2],o=n[3],s=n[4],i=n[5];if([r,a,s,i].some(isNaN)||r>=a||s<=0||i<=0)return;const l=$("decoded").value.split("\\n").filter((t=>""!==t.trim()));let c="";let d=-1;for(const u of l){const t=u.split(",");if(2===t.length){const e=parseInt(t[0],10);!isNaN(e)&&e<r&&e>d&&(c=t[1].trim(),d=e)}}const f=[];let p=r;for(;p<=a;){f.push(`${p},${o}`),p+=s;if(p>a)break;f.push(`${p},${c}`),p+=i}const m=new Map;l.forEach((t=>{const e=t.split(","),n=parseInt(e[0],10);isNaN(n)||m.set(n,e[1]?e[1].trim():"")})),f.forEach((t=>{const e=t.split(","),n=parseInt(e[0],10);isNaN(n)||m.set(n,e[1]?e[1].trim():"")}));const g=Array.from(m.entries()).sort(((t,e)=>t[0]-e[0])).map((([t,e])=>`${t},${e}`));setHuman(g.join("\\n"))};var decodedTa=$("decoded"),lastSel={start:0,end:0};if(decodedTa){decodedTa.addEventListener("blur",function(){if(decodedTa.selectionStart!==decodedTa.selectionEnd){lastSel.start=decodedTa.selectionStart;lastSel.end=decodedTa.selectionEnd}})}document.getElementById("offset-apply").onclick=function(){const t=$("decoded"),e=$("offset-ms");if(!t||!e)return;const n=parseInt(e.value,10);if(isNaN(n)||0===n)return;let o=t.selectionStart,a=t.selectionEnd;if(o===a){o=lastSel.start;a=lastSel.end}const l=t.value;if(o===a)return;let s=l.lastIndexOf("\\n",o-1)+1,i=l.indexOf("\\n",a);-1===i&&(i=l.length);const r=l.substring(0,s),c=l.substring(i),u=l.substring(s,i),d=u.split("\\n").map((t=>{if(""===t.trim())return t;const e=t.split(",");if(e.length<2)return t;const o=parseInt(e[0],10);if(isNaN(o))return t;let a=o+n;a<0&&(a=0);const l=e.slice(1).join(",");return`${a},${l}`})).join("\\n");setHuman(r+d+c);e.value="";lastSel={start:0,end:0}};(function() { var fb = $("findbar"), f = $("find"), cnt = $("find-count"), ta = $("decoded"); var state = { idx: -1, pos: [] }; function updateCount() { if (!state.pos.length) { cnt.textContent = "0 of 0"; } else { cnt.textContent = (state.idx + 1) + " of " + state.pos.length; } } function select(k) { if (k < 0 || k >= state.pos.length) { if (!state.pos.length) updateCount(); return; } state.idx = k; var start = state.pos[k]; var len = (f.value || "").length; var hadFindFocus = document.activeElement === f; ta.focus(); try { ta.setSelectionRange(start, start + len); } catch (e) {} var textBefore = ta.value.substring(0, start); var lineNumber = textBefore.split(\'\\n\').length; var style = window.getComputedStyle(ta); var lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.2) || 15; var scrollTop = (lineNumber - 1) * lineHeight; ta.scrollTop = scrollTop - (ta.clientHeight / 2) + (lineHeight / 2); if (hadFindFocus) { try { f.focus(); } catch (e) {} } updateCount(); } function refresh() { if (!fb || fb.style.display === "none\") return; var term = f.value || \"\"; var txt = ta.value || \"\"; var hay = txt.toLowerCase(); var needle = term.toLowerCase(); var lastKnownPosition = ta.selectionStart; state.pos = []; state.idx = -1; if (!needle) { updateCount(); return; } var p = 0; while (true) { var i = hay.indexOf(needle, p); if (i === -1) break; state.pos.push(i); p = i + needle.length; } if (state.pos.length) { var nextIdx = state.pos.findIndex(function(p) { return p >= lastKnownPosition; }); select(nextIdx !== -1 ? nextIdx : 0); } else { updateCount(); } } function next() { if (!state.pos.length) return; var newIdx = (state.idx + 1) % state.pos.length; select(newIdx); } function prev() { if (!state.pos.length) return; var newIdx = (state.idx - 1 + state.pos.length) % state.pos.length; select(newIdx); } if (fb && f && cnt && ta) { $(\"find-next\").onclick = function() { next() }; $(\"find-prev\").onclick = function() { prev() }; $(\"find-close\").onclick = function() { fb.style.display = \"none\" }; f.addEventListener("input", function() { refresh() }); f.addEventListener("keydown", function(e) { if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? prev() : next(); } }); window.addEventListener("keydown", function(e) { if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.code === "KeyF")) { e.preventDefault(); fb.style.display = "flex"; f.focus(); try { f.select() } catch (e) {} refresh(); } else if (e.key === "Escape" && fb.style.display !== "none") { e.preventDefault(); fb.style.display = "none"; } else if (e.key === "F3" && fb.style.display !== "none") { e.preventDefault(); e.shiftKey ? prev() : next(); } }); var _setHuman = setHuman; setHuman = function(v) { _setHuman(v); try { if (fb.style.display !== "none") refresh(); } catch (e) {} }; } })();});</script>';
    */
    tasWindow.loadFile(path.join(__dirname, "tas-tool.html"));
    // Inject Undo/Redo UI and history manager for decoded textarea after the TAS window loads
    try {
        tasWindow.webContents.once("did-finish-load", (() => {
            try {
                tasWindow.webContents.executeJavaScript(`
window.__tasHistory = ${JSON.stringify(tasHistory)};
window.__tasHistoryIndex = ${tasHistoryIndex};
(function(){
  try {
    var $ = function(id){ return document.getElementById(id); };
    var decodedEl = $("decoded");
    if (!decodedEl) return;

    // Add Undo/Redo buttons next to Copy/Clear/Apply if not present
    var copyBtn = $("copy");
    var container = copyBtn ? copyBtn.parentElement : null;
    if (container && !$("undo") && !$("redo")) {
      var undoBtn = document.createElement("button");
      undoBtn.id = "undo";
      undoBtn.textContent = "Undo";
      container.insertBefore(undoBtn, copyBtn);

      var redoBtn = document.createElement("button");
      redoBtn.id = "redo";
      redoBtn.textContent = "Redo";
      container.insertBefore(redoBtn, copyBtn);
    }

    var undoBtn = $("undo");
    var redoBtn = $("redo");

    var history = Array.isArray(window.__tasHistory) ? window.__tasHistory : [];
    var historyIndex = typeof window.__tasHistoryIndex === "number" ? window.__tasHistoryIndex : -1;
    var historyApplying = false;
    var lastInputTime = 0;
    var HISTORY_MAX = 200;
    
    function sendHistoryUpdate() {
        try {
            if (window.electron && typeof window.electron.tasToolHistoryUpdate === "function") {
                window.electron.tasToolHistoryUpdate({ history: history, historyIndex: historyIndex });
            }
        } catch(e) {}
    }

    function updateButtons() {
      try { if (undoBtn) undoBtn.disabled = !(historyIndex > 0); } catch(e) {}
      try { if (redoBtn) redoBtn.disabled = !(historyIndex + 1 < history.length); } catch(e) {}
    }
    function getState() {
      return {
        value: decodedEl.value || "",
        selStart: decodedEl.selectionStart || 0,
        selEnd: decodedEl.selectionEnd || 0,
        scrollTop: decodedEl.scrollTop || 0
      };
    }
    function pushState(state) {
      if (historyApplying) return;
      if (historyIndex < history.length - 1) {
        history = history.slice(0, historyIndex + 1);
      }
      var cur = history[historyIndex];
      if (cur && cur.value === state.value && cur.selStart === state.selStart && cur.selEnd === state.selEnd) {
        updateButtons();
        return;
      }
      history.push(state);
      if (history.length > HISTORY_MAX) {
        history.shift();
        historyIndex--;
      }
      historyIndex = history.length - 1;
      updateButtons();
      sendHistoryUpdate();
    }
    function applyState(state) {
      historyApplying = true;
      try {
        if (typeof setHuman === "function") {
          setHuman(state.value);
        } else {
          decodedEl.value = state.value;
          decodedEl.textContent = state.value;
        }
        decodedEl.focus();
        try { decodedEl.setSelectionRange(state.selStart, state.selEnd); } catch (e) {}
        
        // Smart scroll to selection
        try {
          var ta = decodedEl;
          var start = state.selStart;
          var textBefore = ta.value.substring(0, start);
          var lineNumber = textBefore.split('\\n').length;
          var style = window.getComputedStyle(ta);
          var lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.2) || 15;
          var scrollTop = (lineNumber - 1) * lineHeight;
          ta.scrollTop = scrollTop - (ta.clientHeight / 2) + (lineHeight / 2);
        } catch (e) {
          // Fallback to the explicit scrollTop from the state
          try { decodedEl.scrollTop = state.scrollTop; } catch (e) {}
        }
      } finally {
        historyApplying = false;
        updateButtons();
      }
    }
    function undo() {
      if (historyIndex > 0) {
        var stateBeingUndone = history[historyIndex];
        historyIndex--;
        var stateToRestore = history[historyIndex];
        
        var appliedState = {
          value: stateToRestore.value,
          selStart: stateBeingUndone.selStart,
          selEnd: stateBeingUndone.selEnd,
          scrollTop: stateBeingUndone.scrollTop
        };
        
        applyState(appliedState);
        sendHistoryUpdate();
      }
      updateButtons();
    }
    function redo() {
      if (historyIndex + 1 < history.length) {
        historyIndex++;
        var stateToRestore = history[historyIndex];
        applyState(stateToRestore);
        sendHistoryUpdate();
      }
      updateButtons();
    }

    // Wrap setHuman to capture programmatic updates and create better history states
    try {
      var __origSetHuman = typeof setHuman === "function" ? setHuman : null;
      if (__origSetHuman) {
        setHuman = function(v) {
          var oldValue = decodedEl.value;
          __origSetHuman(v);
          if (!historyApplying) {
            var state = getState();
            var newValue = state.value;
            var start = 0;
            var max = Math.min(oldValue.length, newValue.length);
            while (start < max && oldValue[start] === newValue[start]) {
              start++;
            }
            state.selStart = start;
            state.selEnd = start;
            pushState(state);
          }
        };
      }
    } catch (e) {}

    // Initial snapshot
    if (history.length === 0) {
        pushState(getState());
    }

    // Capture user edits (coalesce rapid typing)
    decodedEl.addEventListener("input", function() {
      if (historyApplying) return;
      var now = Date.now();
      if (history.length && now - lastInputTime < 300) {
        history[historyIndex] = getState();
        updateButtons();
        sendHistoryUpdate();
      } else {
        pushState(getState());
      }
      lastInputTime = now;
    });

    // Wire buttons
    if (undoBtn) undoBtn.onclick = function(){ undo(); };
    if (redoBtn) redoBtn.onclick = function(){ redo(); };

    // Keyboard shortcuts: Ctrl/Cmd+Z, Ctrl+Y, Cmd+Shift+Z
    window.addEventListener("keydown", function(e) {
      var isMod = e.ctrlKey || e.metaKey;
      if (!isMod || e.altKey) return;
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        redo();
      }
    }, true);

    updateButtons();
  } catch (e) {}
})();`).catch(()=>{});
            } catch {}
        }));
    } catch {}
    if (lastTasRecording && tasWindow) {
        const dec = decodeTasRecording(lastTasRecording),
            human = dec ? formatTasHuman(dec) : "";
        tasWindow.webContents.executeJavaScript('window.__tasEncoded=' + JSON.stringify(lastTasRecording) + ';window.__tasDecoded=' + JSON.stringify(human) + ';try{document.getElementById("encoded").value=window.__tasEncoded||"";}catch{}try{var d=document.getElementById("decoded");if(d){d.value=window.__tasDecoded||"";d.textContent=window.__tasDecoded||"";}}catch{}')
    }
    if (lastTasGhosts && tasWindow) {
        tasWindow.webContents.executeJavaScript('window.__tasGhosts=' + JSON.stringify(lastTasGhosts) + ';try{if(window.renderGhosts) renderGhosts(window.__tasGhosts);}catch{}')
    }
};
singleInstanceLockSucessful ? app.on("second-instance", (() => {
    null != browserWindow && (browserWindow.isMinimized() && browserWindow.restore(), browserWindow.focus())
})) : app.quit(), app.on("web-contents-created", ((e, n) => {
    n.setWindowOpenHandler((({
        url: e
    }) => ("https://www.kodub.com/" != e && "https://opengameart.org/content/sci-fi-theme-1" != e && "https://www.kodub.com/privacy/polytrack" != e && "https://www.kodub.com/discord/polytrack" != e || setImmediate((() => {
        shell.openExternal(e)
    })), {
        action: "deny"
    }))), n.on("will-navigate", ((e, n) => {
        e.preventDefault()
    }))
})), ipcMain.on("quit", (() => {
    app.quit()
})), ipcMain.on("open-tas-tool", (() => {
    ensureTasWindow()
})), ipcMain.on("tas-tool-set-recording", ((e, n) => {
    lastTasRecording = "string" == typeof n ? n : n && n.serialize ? n.serialize() : "";
    const dec = decodeTasRecording(lastTasRecording),
        human = dec ? formatTasHuman(dec) : "";
    tasWindow && tasWindow.webContents && tasWindow.webContents.executeJavaScript('window.__tasEncoded=' + JSON.stringify(lastTasRecording) + ';window.__tasDecoded=' + JSON.stringify(human) + ';try{document.getElementById("encoded").value=window.__tasEncoded||"";}catch{}try{var d=document.getElementById("decoded");if(d){d.value=window.__tasDecoded||"";d.textContent=window.__tasDecoded||"";}}catch{}')
})), ipcMain.on("tas-tool-apply", ((e, n) => {
    console.log(n); // already no "r"
    if (tasWindow && !tasWindow.isDestroyed()) {
        const e = parseTasHuman(n);
        if (e) {
            const n = encodeTasRecording(e);
            n && (lastTasRecording = n, tasWindow.webContents.send("tas-tool-encoded-update", n), browserWindow && !browserWindow.isDestroyed() && browserWindow.webContents && browserWindow.webContents.send("tas-tool-apply", n))
        }
    }
})),
// Save decoded human-readable TAS to a file
ipcMain.handle("tas-tool-save-to-file", (async (e, text) => {
    try {
        const parent = tasWindow && !tasWindow.isDestroyed() ? tasWindow : BrowserWindow.getFocusedWindow();
        const { canceled, filePath } = await dialog.showSaveDialog(parent, {
            title: "Save TAS Script",
            defaultPath: "tas-script.tas",
            filters: [
                { name: "TAS Scripts", extensions: ["tas", "txt"] },
                { name: "All Files", extensions: ["*"] }
            ]
        });
        if (canceled || !filePath) return { canceled: true };
        await fs.promises.writeFile(filePath, "string" == typeof text ? text : "", "utf8");
        return { canceled: false, filePath };
    } catch (err) {
        return { canceled: true, error: String(err && err.message || err) };
    }
})),
// Load decoded human-readable TAS from a file
ipcMain.handle("tas-tool-load-from-file", (async () => {
    try {
        const parent = tasWindow && !tasWindow.isDestroyed() ? tasWindow : BrowserWindow.getFocusedWindow();
        const { canceled, filePaths } = await dialog.showOpenDialog(parent, {
            title: "Load TAS Script",
            filters: [
                { name: "TAS Scripts", extensions: ["tas", "txt"] },
                { name: "All Files", extensions: ["*"] }
            ],
            properties: ["openFile"]
        });
        if (canceled || !filePaths || !filePaths[0]) return { canceled: true };
        const content = await fs.promises.readFile(filePaths[0], "utf8");
        return { canceled: false, filePath: filePaths[0], content };
    } catch (err) {
        return { canceled: true, error: String(err && err.message || err) };
    }
})),
ipcMain.on("tas-tool-history-update", ((e, data) => {
    if (data && Array.isArray(data.history)) {
        tasHistory = data.history;
        tasHistoryIndex = "number" == typeof data.historyIndex ? data.historyIndex : -1;
    }
})),
app.on("window-all-closed", (() => {
    app.quit()
})), app.whenReady().then((() => {
    browserWindow = new BrowserWindow({
        width: 1024,
        height: 800,
        minWidth: 320,
        minHeight: 200,
        fullscreen: !0,
        useContentSize: !0,
        autoHideMenuBar: !0,
        webPreferences: {
            devTools: !1,
            preload: path.join(__dirname, "preload.js"),
            backgroundThrottling: !1
        }
    }), browserWindow.removeMenu(), browserWindow.webContents.on("before-input-event", ((e, n) => {
        n.isAutoRepeat || "keyDown" != n.type || ("F11" == n.code || n.alt && "Enter" == n.code) && (browserWindow.setFullScreen(!browserWindow.isFullScreen()), e.preventDefault())
    })), browserWindow.on("enter-full-screen", (() => {
        browserWindow.webContents.send("fullscreen-change", !0)
    })), browserWindow.on("leave-full-screen", (() => {
        browserWindow.webContents.send("fullscreen-change", !1)
    })), ipcMain.on("is-fullscreen", ((e) => {
        e.returnValue = browserWindow.isFullScreen()
    })), ipcMain.on("set-fullscreen", ((e, n) => {
        browserWindow.setFullScreen(n)
    })),
    // From game renderer: update ghosts list for TAS window
    ipcMain.on("tas-tool-set-ghosts", ((e, payload) => {
        try {
            if (payload && Array.isArray(payload.names)) {
                if (lastTasGhosts && Array.isArray(lastTasGhosts.names) && lastTasGhosts.names.length === payload.names.length) {
                    // Preserve visibility if omitted or mismatched length
                    if (Array.isArray(lastTasGhosts.visibility)) {
                        payload.visibility = payload.visibility && payload.visibility.length === lastTasGhosts.visibility.length ? payload.visibility : lastTasGhosts.visibility;
                    }
                    // Preserve primary colors if missing
                    if (Array.isArray(lastTasGhosts.colors) && (!Array.isArray(payload.colors) || payload.colors.length !== lastTasGhosts.colors.length)) {
                        payload.colors = lastTasGhosts.colors;
                    }
                    // Preserve secondary colors if missing
                    if (Array.isArray(lastTasGhosts.secondaryColors) && (!Array.isArray(payload.secondaryColors) || payload.secondaryColors.length !== lastTasGhosts.secondaryColors.length)) {
                        payload.secondaryColors = lastTasGhosts.secondaryColors;
                    }
                }
                lastTasGhosts = payload;
                tasWindow && tasWindow.webContents && tasWindow.webContents.send("tas-tool-ghosts-update", payload);
            }
        } catch {}
    })),
    // From TAS window: request to load a specific ghost's recording into the editor
    ipcMain.on("tas-tool-request-load", ((e, index) => {
        try {
            if (browserWindow && !browserWindow.isDestroyed()) {
                browserWindow.webContents && browserWindow.webContents.send("tas-tool-request-load", index);
            }
        } catch {}
    })),
    // From TAS window: visibility toggles -> forward to game renderer
    ipcMain.on("tas-tool-set-visibility", ((e, visibleArray) => {
        try {
            if (lastTasGhosts) {
                lastTasGhosts.visibility = Array.isArray(visibleArray) ? visibleArray : null;
                // Echo updated ghosts back to TAS window so checkboxes reflect changes
                tasWindow && tasWindow.webContents && tasWindow.webContents.send("tas-tool-ghosts-update", lastTasGhosts);
            }
        } catch {}
        browserWindow && browserWindow.webContents && browserWindow.webContents.send("tas-tool-set-visibility", visibleArray)
    })),
    browserWindow.loadFile("index.html")
}));
