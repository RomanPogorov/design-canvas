// The design canvas's writing: the selected elements' style or text, a structural change, the layout of the canvas,
// undo and redo — each edit sent by address with the file's version, the frame reloaded only when it must.
(() => {
  const V = (document.currentScript && new URL(document.currentScript.src, location.href).searchParams.get("v")) || "";
  ((window.__dcvParts ||= {})[V] ||= {}).write = (host) => {
    // ── writing: the selected elements' style or text, or a structural change ──
    const { frame, post, say, csrf, tab, clear } = host;
    let pending = {}, timer = 0;
    function change(ch, final) {
      if (!host.sel || host.ro || host.sel.info.tag === "artboard") return;
      Object.assign(pending, ch); frame(host.sel.board)?.postMessage({ __dcvHost: { t: "preview", tids: host.sel.tids, changes: ch } }, "*");
      clearTimeout(timer);
      if (final) commit(); else timer = setTimeout(commit, 700);
    }
    let recolorT = 0, recolorPending = null;
    function recolor(uses, value, final) {
      if (!host.sel || host.ro) return;
      const groups = new Map();
      for (const u of uses) groups.set(u.prop, [...(groups.get(u.prop) || []), u.tid]);
      const batch = [...groups].map(([prop, tids]) => ({ tids: [...new Set(tids)], changes: { [prop]: value } }));
      for (const g of batch) frame(host.sel.board)?.postMessage({ __dcvHost: { t: "preview", tids: g.tids, changes: g.changes } }, "*");
      recolorPending = { board: host.sel.board, batch };
      clearTimeout(recolorT);
      const go = async () => { const p = recolorPending; recolorPending = null; if (!p) return; const j = await edit(p.board, { op: "styles", batch: p.batch }); frame(p.board)?.postMessage({ __dcvHost: { t: j ? "settle" : "rollback" } }, "*"); };
      if (final) go(); else recolorT = setTimeout(go, 700);
    }
    function rollback() { clearTimeout(timer); pending = {}; if (host.sel) frame(host.sel.board)?.postMessage({ __dcvHost: { t: "rollback" } }, "*"); }
    async function commit() {
      clearTimeout(timer);
      if (!host.sel || !Object.keys(pending).length) return;
      const changes = pending, s = host.sel; pending = {};
      const j = await edit(s.board, { op: "style", tids: s.tids, changes });
      frame(s.board)?.postMessage({ __dcvHost: { t: j ? "settle" : "rollback" } }, "*");
    }
    // the edit route answers with the file's new version: same tids (style, one text) → the frame already shows it
    async function edit(b, body) {
      b.dataset.pending = "1";
      try {
        const r = await post(`/p/design-canvas/edit/${tab}`, { file: b.dataset.file, v: b.dataset.v, ...body });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { say(r.status === 409 ? host.L.stale : host.L[`err_${j.error}`] || host.L.notSaved, "error"); if (r.status === 409) reload(b, j.v); return null; }
        b.dataset.v = j.v;
        // the frame shows this already (a style, one text) or reloads to it (act): either way it is this key
        if (j.k) b.dataset.k = j.k;
        return j;
      } finally {
        delete b.dataset.pending;
        if (b.dataset.nextK && b.dataset.nextK !== b.dataset.k) reload(b, null, b.dataset.nextK);
        delete b.dataset.nextK;
      }
    }
    // what a structural action means for this selection: a copy of a repeat is one item of its data; otherwise every
    // selected tag (a part of a repeat is its template: all copies)
    const asItem = () => host.sel && host.sel.info.item && !(host.sel.own?.length > 1);
    const want = new Map();   // board → { tid, item } to select once it reloads
    async function act(op, extra = {}, keepSel) {
      if (!host.sel || host.ro || host.sel.info.tag === "artboard") return;
      await commit();
      const s = host.sel;
      const body = asItem() && ["delete", "duplicate", "move"].includes(op) ? { op: "item", path: s.info.item, action: op === "move" ? extra.dir : op } : { op, tids: s.own || [s.info.tid], ...extra };
      const j = await edit(s.board, body);
      if (!j) return;
      if (op === "delete" && !keepSel) clear(); else want.set(s.board, { tid: j.select ?? s.info.tid, item: j.item ?? (body.op === "item" ? null : s.info.within) });
      reload(s.board, j.v, j.k);
    }
    // reload one frame: `k` is the render key (the file and what it imports) the server gave, else a fresh one
    function reload(b, v, k) {
      if (v) b.dataset.v = v;
      const f = b.querySelector("iframe"), u = new URL(f.dataset.src, location.href);
      if (k) b.dataset.k = k;
      u.searchParams.set("v", k ? k : `${b.dataset.k}.${Date.now().toString(36)}`); f.dataset.src = u.pathname + u.search;
      b.querySelectorAll(".dcv-ring, .dcv-pin").forEach((n) => n.remove());
      if (f.getAttribute("src")) { b.classList.remove("live"); f.src = f.dataset.src; }
      // its preview follows (drawn again by the server for the new content)
      const th = b.querySelector(".dcv-thumb"); if (th && k) { th.src = `${th.dataset.base}&k=${k}`; delete b.dataset.r; delete b.dataset.rWant; }
    }
    const layout = async (body) => {
      const r = await post(`/p/design-canvas/layout/${tab}`, body);
      if (!r.ok) say(host.L.notSaved, "error");
      return r.ok ? r.json().catch(() => ({})) : null;
    };
    const resizeBoard = async (axis, n) => {
      if (!host.sel || !Number.isFinite(n) || n < 40) return;
      const b = host.sel.board, w = axis === "w" ? n : b.offsetWidth, h = axis === "h" ? n : b.offsetHeight;
      await layout({ op: "resize", file: b.dataset.file, w: Math.round(w), h: Math.round(h) });
    };
    let stepping = false;
    const step = async (dir) => {
      if (stepping) return;
      stepping = true;
      try {
        await commit();
        const r = await fetch(`/canvas/${tab}/${dir}`, { method: "POST", headers: { "x-csrf": csrf() } });
        const why = r.status === 409 ? (await r.json().catch(() => ({}))).reason : null;
        say(r.ok ? (dir === "undo" ? host.L.undone : host.L.redone) : r.status === 409 ? (dir === "redo" ? host.L.nothingRedo : why === "agent" ? host.L.nothingAgent : why === "conflict" ? host.L.undoConflict : host.L.nothing) : host.L.notSaved, r.ok ? "success" : r.status === 409 ? "info" : "error");
      } finally { setTimeout(() => { stepping = false; }, 350); }
    };
    const undo = () => step("undo"), redo = () => step("redo");
    // a change the canvas made itself (a free element dragged): saved like the panel's
    const pend = (ch) => { Object.assign(pending, ch); return commit(); };
    return { change, recolor, rollback, commit, pend, edit, act, reload, layout, resizeBoard, undo, redo, asItem, want };
  };
})();
