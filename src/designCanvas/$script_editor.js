// The design canvas editor: one camera over a world of artboards (each a sandboxed frame at 1:1, moved by
// translate + scale), row titles and stickies, comment pins; a top bar (pages, sticky, comment mode, comments,
// versions, preview, export) and a properties panel for what is selected. Elements are picked inside the frames by
// the picker ($script_picker.js), which reports their address (data-tid); every change is a POST to the plugin's
// routes and the page polls the canvas's state, so the agent's work appears as it is written.
(() => {
  const root = document.getElementById("dc");
  if (!root) return;
  const NAME = root.dataset.name, CSRF = root.dataset.csrf || "";
  const BASE = `/designCanvas/${encodeURIComponent(NAME)}`;
  let S = JSON.parse(document.getElementById("dc-state").textContent);
  const camKey = `dc-cam:${NAME}`;
  let sheet = S.sheets[0].id;
  let cam = { x: 40, y: 90, z: 0.5 };
  let sel = null;            // { kind: "board", file } | { kind: "note", id } | { kind: "el", file, tids, info }
  let commentMode = false, side = "inspect", showResolved = false;
  const undo = [];
  const nodes = new Map();   // file → board node
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const ICON = {
    sticky: '<path d="M4 4h16v10l-6 6H4z"/><path d="M14 20v-6h6"/>',
    comment: '<path d="M4 5h16v11H9l-5 4z"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    play: '<path d="M7 5l12 7-12 7z"/>',
    download: '<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>',
  };
  const ic = (n) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(camKey) || "null"); if (stored && stored.cam && Number.isFinite(stored.cam.z)) { cam = stored.cam; if (S.sheets.some((p) => p.id === stored.sheet)) sheet = stored.sheet; } else stored = null; } catch { stored = null; }

  root.innerHTML = `
    <header class="dc-top">
      <b class="dc-title"></b>
      <nav class="dc-pages" aria-label="Pages"></nav>
      <span class="dc-grow"></span>
      <button type="button" class="dc-btn" data-a="sticky" title="Add a sticky note">${ic("sticky")}<span>Sticky</span></button>
      <button type="button" class="dc-btn" data-a="comment" aria-pressed="false" title="Comment on an element (C)">${ic("comment")}<span>Comment</span></button>
      <button type="button" class="dc-btn" data-a="comments" title="All comments">${ic("list")}<span>Comments</span><i class="dc-badge" hidden></i></button>
      <button type="button" class="dc-btn" data-a="versions" title="Saved versions">${ic("clock")}<span>Versions</span></button>
      <button type="button" class="dc-btn" data-a="preview" title="Preview the flow">${ic("play")}<span>Preview</span></button>
      <a class="dc-btn" href="${BASE}/export" title="Download all artboards as one HTML page">${ic("download")}<span>Export</span></a>
    </header>
    <div class="dc-body">
      <div class="dc-stage" tabindex="0"><div class="dc-world"></div><div class="dc-empty" hidden>No artboards on this page yet. Ask the agent to design screens.</div>
        <div class="dc-zoom"><button type="button" data-a="out" aria-label="Zoom out">−</button><button type="button" class="dc-pct" data-a="100" aria-label="Zoom to 100%">50%</button><button type="button" data-a="in" aria-label="Zoom in">+</button><button type="button" data-a="fit" aria-label="Fit (Shift+1)" title="Fit (Shift+1)">${ic("fit")}</button></div>
        <div class="dc-status" role="status"></div>
      </div>
      <aside class="dc-panel" aria-label="Properties"></aside>
    </div>
    <div class="dc-play" hidden><div class="dc-play-h"><b class="dc-play-t"></b><span class="dc-grow"></span>
      <button type="button" class="dc-btn" data-a="play-prev" aria-label="Previous screen">${ic("left")}</button><button type="button" class="dc-btn" data-a="play-next" aria-label="Next screen">${ic("right")}</button><button type="button" class="dc-btn" data-a="play-close" aria-label="Close preview">${ic("x")}</button></div>
      <div class="dc-play-stage"></div></div>`;
  const $ = (s, el = root) => el.querySelector(s);
  const stage = $(".dc-stage"), world = $(".dc-world"), panel = $(".dc-panel"), status = $(".dc-status");
  let statusTimer = 0;
  const say = (text, bad) => { status.textContent = text; status.classList.toggle("bad", !!bad); clearTimeout(statusTimer); statusTimer = setTimeout(() => { status.textContent = ""; }, 3500); };

  // ── server ──
  const post = async (path, body) => {
    const r = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": CSRF }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    return { ok: r.ok, status: r.status, ...j };
  };
  const layout = async (ops, quiet) => {
    const r = await post("/layout", { ops });
    if (!r.ok) say(r.error || "Not saved", true); else if (!quiet) say(r.note || "Saved");
    await refresh(true);
    return r;
  };
  const ERR = { bound: "This text comes from a template — edit it as data or the template", children: "Only a text without inner elements can be edited in place", edge: "Nothing to do", nodata: "This artboard has no data block" };
  const edit = async (file, body, opts = {}) => {
    const r = await post("/edit", { ...body, file, v: S.v[file] });
    if (r.status === 409 && r.error === "stale") { say("The artboard changed meanwhile — try again", true); await refresh(true); return null; }
    if (!r.ok) { say(ERR[r.error] || r.error || "Not saved", true); return null; }
    if (!opts.noUndo) undo.push({ kind: "file", file, before: r.before });
    S.v[file] = r.v; S.keys[file] = r.key;
    if (sel && sel.kind === "el" && sel.file === file) {
      if (r.select !== undefined && r.select !== null) sel.tids = [r.select];
      else if (body.op === "delete" || (body.op === "data" && body.action === "delete")) sel = null;
    }
    say(r.note || "Saved");
    await refresh(true);
    return r;
  };
  let polling = false;
  async function refresh(force) {
    if (polling && !force) return;
    polling = true;
    try {
      // offline or the server restarting: the next poll tries again
      const r = await fetch(`${BASE}/state`, { cache: "no-store" }).catch(() => null);
      if (!r || !r.ok) return;
      const next = await r.json();
      if (!force && next.rev === S.rev) return;
      S = next;
      if (!S.sheets.some((p) => p.id === sheet)) sheet = S.sheets[0].id;
      if (sel && (sel.kind === "board" || sel.kind === "el") && !S.boards[sel.file]) sel = null;
      if (sel && sel.kind === "note" && !S.notes[sel.id]) sel = null;
      draw();
      if (!panel.contains(document.activeElement)) drawPanel();
    } finally { polling = false; }
  }
  setInterval(() => { if (!document.hidden) refresh(); }, 2000);

  // ── camera ──
  const apply = () => {
    world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`;
    $(".dc-pct").textContent = `${Math.round(cam.z * 100)}%`;
    root.style.setProperty("--z", cam.z);
    try { localStorage.setItem(camKey, JSON.stringify({ cam, sheet })); } catch {}
  };
  const zoomAt = (f, px, py) => {
    const r = stage.getBoundingClientRect(), x = px - r.left, y = py - r.top;
    const z = Math.min(4, Math.max(0.05, cam.z * f));
    cam = { x: x - ((x - cam.x) * z) / cam.z, y: y - ((y - cam.y) * z) / cam.z, z };
    apply();
  };
  const zoomMid = (f) => { const r = stage.getBoundingClientRect(); zoomAt(f, r.left + r.width / 2, r.top + r.height / 2); };
  const onSheet = (x) => (x.sheet && S.sheets.some((p) => p.id === x.sheet) ? x.sheet : S.sheets[0].id) === sheet;
  function fit() {
    const items = [...Object.values(S.boards).filter(onSheet), ...Object.values(S.notes).filter(onSheet).map((n) => ({ x: n.x, y: n.y, w: n.w || 300, h: n.kind === "title" ? 80 : 160 }))];
    if (!items.length) { cam = { x: 40, y: 40, z: 0.5 }; apply(); return; }
    const x0 = Math.min(...items.map((b) => b.x)), y0 = Math.min(...items.map((b) => b.y)) - 40;
    const x1 = Math.max(...items.map((b) => b.x + b.w)), y1 = Math.max(...items.map((b) => b.y + b.h));
    const r = stage.getBoundingClientRect(), pad = 48;
    const z = Math.min(1, Math.max(0.05, Math.min((r.width - pad * 2) / (x1 - x0), (r.height - pad * 2) / (y1 - y0))));
    cam = { x: pad - x0 * z + ((r.width - pad * 2) - (x1 - x0) * z) / 2, y: pad - y0 * z, z };
    apply();
  }
  stage.addEventListener("wheel", (e) => { e.preventDefault(); if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY); else { cam.x -= e.deltaX; cam.y -= e.deltaY; apply(); } }, { passive: false });
  // panning: drag the empty canvas
  stage.addEventListener("pointerdown", (e) => {
    if (e.target !== stage && e.target !== world) return;
    stage.focus();
    const sx = e.clientX, sy = e.clientY, c0 = { ...cam };
    let moved = false;
    const move = (ev) => { if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) moved = true; cam = { ...c0, x: c0.x + ev.clientX - sx, y: c0.y + ev.clientY - sy }; apply(); };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); if (!moved) select(null); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  });

  // ── drawing the world ──
  const frameOf = (file) => nodes.get(file)?.querySelector("iframe");
  const tell = (file, m) => { const f = frameOf(file); if (f && f.contentWindow) f.contentWindow.postMessage({ __dc: m }, "*"); };
  function boardNode(file) {
    let n = nodes.get(file);
    if (n) return n;
    n = document.createElement("div");
    n.className = "dc-board"; n.dataset.file = file;
    n.innerHTML = `<div class="dc-bname" title="Drag to move · double-click to rename"><span></span></div><div class="dc-frame"></div><i class="dc-rz" title="Resize"></i>`;
    world.appendChild(n); nodes.set(file, n);
    n.querySelector(".dc-bname").addEventListener("pointerdown", (e) => dragBoard(e, file));
    n.querySelector(".dc-bname").addEventListener("dblclick", () => rename(file));
    n.querySelector(".dc-rz").addEventListener("pointerdown", (e) => resizeBoard(e, file));
    return n;
  }
  function draw() {
    $(".dc-title").textContent = S.title;
    document.title = `${S.title} · Design canvas`;
    const pages = $(".dc-pages");
    pages.innerHTML = (S.sheets.length > 1 || S.sheets[0].title ? S.sheets.map((p) => `<button type="button" class="dc-page" data-sheet="${esc(p.id)}" aria-pressed="${p.id === sheet}" title="Double-click to rename">${esc(p.title || "Page 1")}</button>`).join("") : "")
      + `<button type="button" class="dc-page dc-addpage" data-a="addpage" title="Add a page" aria-label="Add a page">${ic("plus")}</button>`;
    const seen = new Set();
    for (const f of S.order) {
      const b = S.boards[f]; if (!b) continue;
      seen.add(f);
      const n = boardNode(f);
      n.hidden = !onSheet(b);
      Object.assign(n.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
      n.querySelector(".dc-bname span").textContent = b.title;
      n.classList.toggle("pending", !!b.pending);
      n.classList.toggle("selected", !!(sel && sel.kind === "board" && sel.file === f));
      const box = n.querySelector(".dc-frame");
      if (b.pending) {
        const next = S.order.find((x) => S.boards[x]?.pending) === f;
        box.innerHTML = `<div class="dc-wait"><i class="dc-spin"></i><span>${next ? "Drawing next…" : "Waiting to be drawn"}</span></div>`; n.dataset.k = "";
      } else if (n.hidden) {
        // a frame on another page is let go; it comes back when its page is shown
        if (box.firstChild) { box.textContent = ""; n.dataset.k = ""; }
      } else if (n.dataset.k !== S.keys[f]) {
        n.dataset.k = S.keys[f] || "";
        let fr = box.querySelector("iframe");
        if (!fr) { box.textContent = ""; fr = document.createElement("iframe"); fr.setAttribute("sandbox", "allow-scripts"); box.appendChild(fr); }
        fr.title = b.title; fr.width = b.w; fr.height = b.h;
        fr.src = `${BASE}/board/${encodeURIComponent(f)}?k=${encodeURIComponent(S.keys[f] || "")}`;
      } else { const fr = box.querySelector("iframe"); if (fr) { fr.width = b.w; fr.height = b.h; } }
    }
    for (const [f, n] of nodes) if (!seen.has(f)) { n.remove(); nodes.delete(f); }
    world.querySelectorAll(".dc-note").forEach((n) => { if (!n.isContentEditable) n.remove(); });
    for (const [id, nt] of Object.entries(S.notes)) {
      if (!onSheet(nt) || world.querySelector(`.dc-note[data-note="${CSS.escape(id)}"]`)) continue;
      const n = document.createElement("div");
      n.className = `dc-note ${nt.kind}`; n.dataset.note = id; n.textContent = nt.text;
      n.title = "Drag to move · double-click to edit";
      n.style.left = `${nt.x}px`; n.style.top = `${nt.y}px`; if (nt.w) n.style.width = `${nt.w}px`;
      n.classList.toggle("selected", !!(sel && sel.kind === "note" && sel.id === id));
      n.addEventListener("pointerdown", (e) => dragNote(e, id));
      n.addEventListener("dblclick", () => editNote(n, id));
      world.appendChild(n);
    }
    world.querySelectorAll(".dc-pin").forEach((n) => n.remove());
    Object.entries(S.comments).filter(([, c]) => !c.resolved || showResolved).forEach(([id, c], i) => {
      const b = S.boards[c.file]; if (!b || !onSheet(b)) return;
      const p = document.createElement("button");
      p.type = "button"; p.className = `dc-pin${c.resolved ? " resolved" : ""}`; p.dataset.comment = id;
      p.textContent = String(i + 1); p.title = `${c.by}: ${c.text}`; p.setAttribute("aria-label", `Comment ${i + 1}: ${c.text}`);
      p.style.left = `${b.x + c.fx * b.w}px`; p.style.top = `${b.y + c.fy * b.h}px`;
      p.addEventListener("click", () => { side = "comments"; drawPanel(id); });
      world.appendChild(p);
    });
    const n = Object.values(S.comments).filter((c) => !c.resolved).length, badge = $(".dc-badge");
    badge.hidden = !n; badge.textContent = String(n);
    $(".dc-empty").hidden = Object.values(S.boards).some(onSheet) || Object.values(S.notes).some(onSheet);
    apply();
  }

  // ── boards ──
  function dragBoard(e, file) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const b = S.boards[file], sx = e.clientX, sy = e.clientY, x0 = b.x, y0 = b.y, n = nodes.get(file);
    let moved = false;
    select({ kind: "board", file });
    const move = (ev) => { moved = true; b.x = Math.round(x0 + (ev.clientX - sx) / cam.z); b.y = Math.round(y0 + (ev.clientY - sy) / cam.z); n.style.left = `${b.x}px`; n.style.top = `${b.y}px`; };
    const up = async () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up);
      if (moved && (b.x !== x0 || b.y !== y0)) { undo.push({ kind: "ops", ops: [{ op: "move", file, x: x0, y: y0 }] }); await layout([{ op: "move", file, x: b.x, y: b.y }], true); }
    };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  }
  function resizeBoard(e, file) {
    e.preventDefault(); e.stopPropagation();
    const b = S.boards[file], sx = e.clientX, sy = e.clientY, w0 = b.w, h0 = b.h, n = nodes.get(file), fr = frameOf(file);
    n.classList.add("resizing");
    const move = (ev) => {
      b.w = Math.max(80, Math.round(w0 + (ev.clientX - sx) / cam.z)); b.h = Math.max(80, Math.round(h0 + (ev.clientY - sy) / cam.z));
      n.style.width = `${b.w}px`; n.style.height = `${b.h}px`; if (fr) { fr.width = b.w; fr.height = b.h; }
    };
    const up = async () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); n.classList.remove("resizing");
      if (b.w !== w0 || b.h !== h0) { undo.push({ kind: "ops", ops: [{ op: "resize", file, w: w0, h: h0 }] }); await layout([{ op: "resize", file, w: b.w, h: b.h }]); }
    };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  }
  async function rename(file) {
    const t = prompt("Artboard title", S.boards[file].title);
    if (t && t.trim() && t !== S.boards[file].title) await layout([{ op: "rename", file, title: t.trim() }]);
  }

  // ── notes ──
  function dragNote(e, id) {
    if (e.button !== 0 || e.currentTarget.isContentEditable) return;
    e.preventDefault(); e.stopPropagation();
    const nt = S.notes[id], sx = e.clientX, sy = e.clientY, x0 = nt.x, y0 = nt.y, n = e.currentTarget;
    let moved = false;
    select({ kind: "note", id });
    const move = (ev) => { moved = true; nt.x = Math.round(x0 + (ev.clientX - sx) / cam.z); nt.y = Math.round(y0 + (ev.clientY - sy) / cam.z); n.style.left = `${nt.x}px`; n.style.top = `${nt.y}px`; };
    const up = async () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up);
      if (moved) { undo.push({ kind: "ops", ops: [{ op: "moveMany", items: [{ note: id, x: x0, y: y0 }] }] }); await layout([{ op: "moveMany", items: [{ note: id, x: nt.x, y: nt.y }] }], true); }
    };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  }
  function editNote(n, id) {
    n.contentEditable = "plaintext-only"; n.focus();
    const r = document.createRange(); r.selectNodeContents(n); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    const done = async (save) => {
      n.removeEventListener("blur", onBlur); n.removeEventListener("keydown", onKey); n.contentEditable = "false";
      const text = n.innerText.trim();
      if (save && text !== S.notes[id].text) await layout([{ op: "note", id, text }]); else n.textContent = S.notes[id].text;
    };
    const onBlur = () => done(true);
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); done(false); } if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); n.blur(); } };
    n.addEventListener("blur", onBlur); n.addEventListener("keydown", onKey);
  }
  async function addSticky() {
    const r = stage.getBoundingClientRect();
    const x = Math.round((r.width / 2 - cam.x) / cam.z), y = Math.round((r.height / 2 - cam.y) / cam.z);
    await layout([{ op: "note", kind: "sticky", text: "Note", x, y, w: 240, ...(sheet !== S.sheets[0].id ? { sheet } : {}) }]);
  }

  // ── selection ──
  function select(next) {
    const prev = sel;
    sel = next;
    if (prev && prev.kind === "el" && (!next || next.kind !== "el" || next.file !== prev.file)) tell(prev.file, { t: "clear" });
    if (sel && sel.kind === "el") tell(sel.file, { t: "select", tids: sel.tids });
    world.querySelectorAll(".selected").forEach((x) => x.classList.remove("selected"));
    if (sel && sel.kind === "board") nodes.get(sel.file)?.classList.add("selected");
    if (sel && sel.kind === "note") world.querySelector(`.dc-note[data-note="${CSS.escape(sel.id)}"]`)?.classList.add("selected");
    if (side !== "inspect" && sel) side = "inspect";
    drawPanel();
  }
  const fileOfSource = (src) => { for (const [f, n] of nodes) { const fr = n.querySelector("iframe"); if (fr && fr.contentWindow === src) return f; } return null; };
  addEventListener("message", async (e) => {
    const m = e.data && e.data.__dc;
    if (!m) return;
    if (play.file && $(".dc-play-stage iframe")?.contentWindow === e.source) { if (m.t === "nav" && S.boards[m.file]) openPlay(m.file); if (m.t === "key") playKey(m.key); return; }
    const file = fileOfSource(e.source);
    if (!file) return;
    if (m.t === "wheel") {
      const r = frameOf(file).getBoundingClientRect(), px = r.left + m.x * cam.z, py = r.top + m.y * cam.z;
      if (m.zoom) zoomAt(Math.exp(-m.dy * 0.01), px, py); else { cam.x -= m.dx; cam.y -= m.dy; apply(); }
    } else if (m.t === "ready") {
      tell(file, { t: "mode", mode: commentMode ? "comment" : "edit" });
      if (sel && sel.kind === "el" && sel.file === file) tell(file, { t: "select", tids: sel.tids, report: true });
    } else if (m.t === "select") {
      if (m.refresh) { if (sel && sel.kind === "el" && sel.file === file) { sel.info = m; if (!panel.contains(document.activeElement)) drawPanel(); } return; }
      const tids = m.shift && sel && sel.kind === "el" && sel.file === file ? [...new Set([...sel.tids, m.tid])] : [m.tid];
      select({ kind: "el", file, tids, info: m });
    } else if (m.t === "deselect") select(null);
    else if (m.t === "text") {
      if (m.kind === "data") await edit(file, { op: "data", action: "set", path: m.path, value: m.text });
      else if (m.kind === "template") await edit(file, { op: "text", tids: [m.tid], text: m.text, template: true });
      else await edit(file, { op: "text", tids: [m.tid], html: m.html, text: m.text });
    } else if (m.t === "comment") composeComment(file, m);
    else if (m.t === "key") hostKey(m);
  });

  // ── comments ──
  function setCommentMode(on) {
    commentMode = on;
    $('[data-a="comment"]').setAttribute("aria-pressed", String(on));
    root.classList.toggle("commenting", on);
    for (const f of nodes.keys()) tell(f, { t: "mode", mode: on ? "comment" : "edit" });
    if (on) say("Click an element to comment on it · Esc to stop");
  }
  function composeComment(file, m) {
    const b = S.boards[file];
    world.querySelectorAll(".dc-compose").forEach((x) => x.remove());
    const box = document.createElement("form");
    box.className = "dc-compose";
    box.style.left = `${b.x + m.fx * b.w}px`; box.style.top = `${b.y + m.fy * b.h}px`;
    box.innerHTML = `<label class="dc-l">Comment on ${esc(m.label || b.title)}<textarea rows="3" required></textarea></label><div class="dc-row"><button type="button" class="dc-btn" data-x>Cancel</button><button class="dc-btn primary">Comment</button></div>`;
    world.appendChild(box);
    const ta = box.querySelector("textarea"); setTimeout(() => ta.focus(), 0);
    box.querySelector("[data-x]").onclick = () => box.remove();
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) box.requestSubmit(); if (e.key === "Escape") box.remove(); });
    box.onsubmit = async (e) => {
      e.preventDefault();
      const text = ta.value.trim(); if (!text) return;
      box.remove();
      await layout([{ op: "comment", file, tid: m.tid, fx: m.fx, fy: m.fy, label: m.label || b.title, text }]);
      setCommentMode(false);
    };
  }

  // ── keys ──
  async function hostKey(k) {
    if (k.key === "Escape") { if (commentMode) setCommentMode(false); else select(null); return; }
    if ((k.key === "z" || k.key === "Z") && k.meta) { await doUndo(); return; }
    if (k.key === "d" && k.meta) { await act("duplicate"); return; }
    if (k.key === "Delete" || k.key === "Backspace") { await act("delete"); return; }
    if (k.key === "c" && !k.meta) { setCommentMode(!commentMode); return; }
    if (k.key === "!" && k.shift) { fit(); return; }
    if (k.key === "Enter" && sel && sel.kind === "el") tell(sel.file, { t: "edit", tid: sel.tids[0] });
  }
  addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']")) return;
    if (!$(".dc-play").hidden) { playKey(e.key); return; }
    if (["Delete", "Backspace"].includes(e.key) || ((e.metaKey || e.ctrlKey) && ["z", "d"].includes(e.key.toLowerCase()))) e.preventDefault();
    hostKey({ key: e.key, meta: e.metaKey || e.ctrlKey, shift: e.shiftKey });
  });
  async function doUndo() {
    const u = undo.pop();
    if (!u) { say("Nothing to undo"); return; }
    if (u.kind === "file") await edit(u.file, { op: "set", html: u.before }, { noUndo: true });
    else await layout(u.ops);
  }
  // an action on the selection; a copy of a repeat acts on its data item unless `element`
  async function act(what, extra = {}) {
    if (!sel) return;
    if (sel.kind === "board") {
      if (what === "delete" && confirm(`Delete the artboard "${S.boards[sel.file].title}"?`)) { const f = sel.file; sel = null; await layout([{ op: "remove", file: f }]); drawPanel(); }
      if (what === "duplicate") await layout([{ op: "duplicate", file: sel.file }]);
      return;
    }
    if (sel.kind === "note") { if (what === "delete") { const id = sel.id; sel = null; await layout([{ op: "removeNote", id }]); drawPanel(); } return; }
    const info = sel.info || {};
    if (info.item && ["delete", "duplicate", "up", "down"].includes(what) && sel.tids.length === 1 && !extra.element) {
      await edit(sel.file, { op: "data", action: what, path: info.item });
      return;
    }
    if (what === "up" || what === "down") return edit(sel.file, { op: "move", tids: sel.tids, dir: what });
    const { element, ...rest } = extra;
    return edit(sel.file, { op: what, tids: sel.tids, ...rest });
  }

  // ── the panel ──
  const field = (label, prop, value, ph) => `<label class="dc-f"><span>${esc(label)}</span><input data-style="${prop}" value="${esc(value || "")}" placeholder="${esc(ph || "")}" spellcheck="false"></label>`;
  const btn = (act, label, cls = "") => `<button type="button" class="dc-btn ${cls}" data-act="${act}">${label}</button>`;
  function drawPanel(focusComment) {
    if (side === "comments") return drawComments(focusComment);
    if (side === "versions") return drawVersions();
    if (!sel) {
      const drawn = S.order.filter((f) => S.boards[f] && !S.boards[f].pending).length, waiting = S.order.length - drawn;
      panel.innerHTML = `<h2 class="dc-h">${esc(S.title)}</h2><p class="dc-p">${drawn} artboard(s) drawn${waiting ? ` · ${waiting} waiting` : ""}</p>${S.note ? `<p class="dc-p dc-sub">Last change: ${esc(S.note)}</p>` : ""}
        <ul class="dc-help"><li>Click an element to select it; Shift-click adds more.</li><li>Double-click a text to edit it in place (Enter saves, Esc cancels).</li><li>Drag an artboard by its name; resize it by its corner.</li><li>Scroll to move, ⌘/Ctrl + scroll to zoom, Shift+1 fits.</li><li>C comments on an element; ⌘Z undoes.</li></ul>`;
      return;
    }
    if (sel.kind === "note") {
      const nt = S.notes[sel.id];
      panel.innerHTML = `<h2 class="dc-h">${nt.kind === "title" ? "Row title" : "Sticky"}</h2><p class="dc-p">Double-click it on the canvas to edit its text.</p><div class="dc-row">${btn("delete", "Delete", "danger")}</div>`;
      return;
    }
    if (sel.kind === "board") {
      const b = S.boards[sel.file];
      panel.innerHTML = `<h2 class="dc-h">Artboard</h2><p class="dc-p dc-mono">${esc(sel.file)}</p>
        <label class="dc-f wide"><span>Title</span><input data-b="title" value="${esc(b.title)}"></label>
        <div class="dc-grid2"><label class="dc-f"><span>W</span><input data-b="w" type="number" min="80" max="4000" value="${b.w}"></label><label class="dc-f"><span>H</span><input data-b="h" type="number" min="80" max="20000" value="${b.h}"></label></div>
        <label class="dc-f wide"><span>Page</span><select data-b="sheet">${S.sheets.map((p) => `<option value="${esc(p.id)}"${p.id === sheet ? " selected" : ""}>${esc(p.title || "Page 1")}</option>`).join("")}<option value="__new">New page…</option></select></label>
        <div class="dc-row wrap">${btn("preview", "Preview")}${btn("duplicate", "Duplicate")}${btn("delete", "Delete", "danger")}</div>`;
      return;
    }
    const i = sel.info || {}, cs = i.computed || {}, inl = i.inline || {};
    const address = `${sel.file}#${sel.tids[0]}`, b = S.boards[sel.file];
    const props = [["Text color", "color"], ["Background", "background-color"], ["Font size", "font-size"], ["Weight", "font-weight"], ["Line height", "line-height"], ["Align", "text-align"], ["Padding", "padding"], ["Margin", "margin"], ["Gap", "gap"], ["Radius", "border-radius"], ["Width", "width"], ["Opacity", "opacity"]];
    const attrs = i.tag === "a" ? [["Link", "href"]] : i.tag === "img" ? [["Image", "src"], ["Alt", "alt"]] : i.tag === "input" || i.tag === "textarea" ? [["Placeholder", "placeholder"]] : i.tag === "button" ? [["Label", "aria-label"]] : [];
    const dataText = !!i.path;
    panel.innerHTML = `<h2 class="dc-h">&lt;${esc(i.tag || "element")}&gt;${sel.tids.length > 1 ? ` · ${sel.tids.length} selected` : ""}</h2>
      <div class="dc-row"><code class="dc-mono dc-addr" title="This element's address">${esc(address)}</code>${btn("copyref", "Copy ref")}</div>
      <p class="dc-p dc-sub">${esc(b ? b.title : "")}${i.copies > 1 ? ` · ${i.copies} copies (a repeat: styles change all)` : ""}${i.item ? ` · data ${esc(i.item)}` : ""}</p>
      ${i.import ? `<p class="dc-box">An instance of <b>${esc(i.import)}</b> — its insides are edited in that artboard. <button type="button" class="dc-btn" data-act="goto" data-file="${esc(i.import)}">Go to component</button></p>` : ""}
      ${i.textOnly && !i.import ? `<label class="dc-f wide"><span>${dataText ? `Text (data ${esc(i.path)})` : i.tpl ? "Template" : "Text"}</span><textarea data-text rows="2">${esc(i.tpl && !dataText ? i.tpl : i.text)}</textarea></label>` : ""}
      <h3 class="dc-h3">Style</h3><div class="dc-grid2">${props.map(([l, p]) => field(l, p, inl[p], cs[p])).join("")}</div>
      ${attrs.length ? `<h3 class="dc-h3">Attributes</h3>${attrs.map(([l, n]) => `<label class="dc-f wide"><span>${l}</span><input data-attr="${n}" value="${esc(i.attrs?.[n] ?? "")}" spellcheck="false"></label>`).join("")}` : ""}
      ${i.item ? `<h3 class="dc-h3">This copy (data item)</h3><div class="dc-row wrap">${btn("up", "Up")}${btn("down", "Down")}${btn("duplicate", "Duplicate")}${btn("delete", "Delete", "danger")}</div>` : ""}
      <h3 class="dc-h3">Element</h3><div class="dc-row wrap">${i.parentTid >= 0 ? btn("parent", "Select parent") : ""}${btn("el-up", "Move up")}${btn("el-down", "Move down")}${btn("el-duplicate", "Duplicate")}${btn("wrap-stack", "Wrap in stack")}${btn("wrap-row", "Wrap in row")}${btn("unwrap", "Ungroup")}${btn("comment-here", "Comment")}${btn("el-delete", "Delete", "danger")}</div>`;
  }
  function drawComments(focus) {
    const list = Object.entries(S.comments).filter(([, c]) => showResolved || !c.resolved);
    panel.innerHTML = `<div class="dc-row"><h2 class="dc-h dc-grow">Comments</h2><button type="button" class="dc-btn" data-act="close-side" aria-label="Close">${ic("x")}</button></div>
      <label class="dc-check"><input type="checkbox" data-resolved ${showResolved ? "checked" : ""}> Show resolved</label>
      ${list.length ? list.map(([id, c], n) => `<article class="dc-cmt${c.resolved ? " resolved" : ""}${id === focus ? " focus" : ""}" data-comment="${esc(id)}">
        <header><b>${n + 1}. ${esc(c.by)}</b><time>${esc(new Date(c.at).toLocaleString())}</time></header>
        <p class="dc-sub"><a href="#" data-goto="${esc(c.file)}">${esc(S.boards[c.file]?.title || c.file)}</a> › ${esc(c.label)}</p><p>${esc(c.text)}</p>
        ${(c.replies || []).map((r) => `<p class="dc-reply"><b>${esc(r.by)}:</b> ${esc(r.text)}</p>`).join("")}
        <form class="dc-row" data-reply><input placeholder="Reply" aria-label="Reply"><button class="dc-btn">Reply</button></form>
        <div class="dc-row">${c.resolved ? "" : `<button type="button" class="dc-btn" data-resolve>Resolve</button>`}<button type="button" class="dc-btn danger" data-remove>Delete</button></div></article>`).join("")
      : `<p class="dc-p">No ${showResolved ? "" : "open "}comments. Press C and click an element to comment on it.</p>`}`;
    if (focus) panel.querySelector(".dc-cmt.focus")?.scrollIntoView({ block: "nearest" });
  }
  async function drawVersions() {
    panel.innerHTML = `<div class="dc-row"><h2 class="dc-h dc-grow">Versions</h2><button type="button" class="dc-btn" data-act="close-side" aria-label="Close">${ic("x")}</button></div>
      <form class="dc-row" data-commit><input placeholder="Name this version (its idea)" aria-label="Version name"><button class="dc-btn primary">Save</button></form><div class="dc-vlist"><p class="dc-p">Loading…</p></div>`;
    const r = await fetch(`${BASE}/versions`, { cache: "no-store" }).then((x) => x.json()).catch(() => []);
    const box = panel.querySelector(".dc-vlist"); if (!box) return;
    box.innerHTML = Array.isArray(r) && r.length ? r.map((v) => `<article class="dc-ver"><b>${v.version}. ${esc(v.label)}</b><span class="dc-sub">${esc(new Date(v.at).toLocaleString())} · ${v.boards} artboard(s)</span>
      <div class="dc-row"><button type="button" class="dc-btn" data-restore="${v.version}">Restore</button><a class="dc-btn" href="${BASE}/export?ver=${v.version}">Export</a></div></article>`).join("") : `<p class="dc-p">No saved versions yet. Save one before trying another direction.</p>`;
  }
  panel.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.matches("[data-resolved]")) { showResolved = t.checked; draw(); drawComments(); return; }
    if (!sel) return;
    if (sel.kind === "board") {
      const k = t.dataset.b, f = sel.file, b = S.boards[f];
      if (k === "title" && t.value.trim()) await layout([{ op: "rename", file: f, title: t.value.trim() }]);
      if (k === "w" || k === "h") { undo.push({ kind: "ops", ops: [{ op: "resize", file: f, w: b.w, h: b.h }] }); await layout([{ op: "resize", file: f, w: k === "w" ? Number(t.value) : b.w, h: k === "h" ? Number(t.value) : b.h }]); }
      if (k === "sheet") {
        const title = t.value === "__new" ? prompt("New page title") : t.value;
        if (!title) { drawPanel(); return; }
        await layout([{ op: "toSheet", file: f, sheet: title }]);
        const nb = S.boards[f]; if (nb) { sheet = nb.sheet || S.sheets[0].id; draw(); focusBoard(f); }
      }
      return;
    }
    if (sel.kind !== "el") return;
    if (t.dataset.style) await edit(sel.file, { op: "style", tids: sel.tids, changes: { [t.dataset.style]: t.value.trim() || null } });
    if (t.dataset.attr) await edit(sel.file, { op: "attr", tids: sel.tids, name: t.dataset.attr, value: t.value === "" ? null : t.value });
    if (t.matches("[data-text]")) {
      const i = sel.info || {};
      if (i.path) await edit(sel.file, { op: "data", action: "set", path: i.path, value: t.value });
      else if (i.tpl) await edit(sel.file, { op: "text", tids: sel.tids, text: t.value, template: true });
      else await edit(sel.file, { op: "text", tids: sel.tids, text: t.value });
    }
  });
  panel.addEventListener("click", async (e) => {
    const t = e.target.closest("button, a"); if (!t) return;
    const a = t.dataset.act;
    if (t.dataset.goto) { e.preventDefault(); focusBoard(t.dataset.goto); return; }
    const cm = t.closest("[data-comment]");
    if (cm && t.matches("[data-resolve]")) { await layout([{ op: "resolveComment", id: cm.dataset.comment }]); drawComments(); return; }
    if (cm && t.matches("[data-remove]")) { if (confirm("Delete this comment?")) { await layout([{ op: "removeComment", id: cm.dataset.comment }]); drawComments(); } return; }
    if (t.dataset.restore) {
      if (!confirm(`Bring back version ${t.dataset.restore}? What is there now is saved as a version first.`)) return;
      const r = await post("/versions", { restore: Number(t.dataset.restore) }); say(r.ok ? `Restored version ${t.dataset.restore}` : r.error, !r.ok); await refresh(true); drawVersions(); return;
    }
    if (!a) return;
    if (a === "close-side") { side = "inspect"; drawPanel(); return; }
    if (a === "preview") { openPlay(sel.file); return; }
    if (a === "goto") { focusBoard(t.dataset.file); return; }
    if (a === "copyref") {
      const i = sel.info || {}, ref = `[${S.boards[sel.file]?.title || sel.file} › ${i.label || i.tag}](${sel.file}#${sel.tids[0]}) on design canvas "${NAME}"`;
      try { await navigator.clipboard.writeText(ref); say("Reference copied — paste it into the chat"); } catch { prompt("Copy this reference", ref); }
      return;
    }
    if (a === "parent") { const p = sel.info.parentTid, f = sel.file; select({ kind: "el", file: f, tids: [p], info: { ...sel.info, tid: p } }); tell(f, { t: "select", tids: [p], report: true }); return; }
    if (a === "comment-here") { const i = sel.info || {}, b = S.boards[sel.file]; composeComment(sel.file, { tid: sel.tids[0], label: i.label, fx: Math.min(1, ((i.rect?.x ?? 0) + (i.rect?.w ?? 0)) / b.w), fy: Math.min(1, (i.rect?.y ?? 0) / b.h) }); return; }
    if (a === "el-up") return act("up", { element: true });
    if (a === "el-down") return act("down", { element: true });
    if (a === "el-duplicate") return act("duplicate", { element: true });
    if (a === "el-delete") return act("delete", { element: true });
    if (a === "wrap-stack") return act("wrap", { layout: "stack" });
    if (a === "wrap-row") return act("wrap", { layout: "row" });
    if (a === "unwrap") return act("unwrap");
    return act(a);
  });
  panel.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, input = f.querySelector("input"), text = input.value.trim();
    if (f.matches("[data-reply]") && text) { await layout([{ op: "replyComment", id: f.closest("[data-comment]").dataset.comment, text }]); drawComments(); }
    if (f.matches("[data-commit]")) { const r = await post("/versions", { label: text }); say(r.ok ? `Saved version ${r.version}: ${r.label}` : r.error, !r.ok); drawVersions(); }
  });
  function focusBoard(file) {
    const b = S.boards[file]; if (!b) { say(`No artboard ${file}`, true); return; }
    if (!onSheet(b)) { sheet = b.sheet || S.sheets[0].id; draw(); }
    const r = stage.getBoundingClientRect(), z = Math.min(1, Math.max(0.1, Math.min((r.width - 80) / b.w, (r.height - 100) / b.h)));
    cam = { x: (r.width - b.w * z) / 2 - b.x * z, y: 60 - b.y * z, z }; apply();
    select({ kind: "board", file });
  }

  // ── preview: one artboard at a time, links between artboards navigate ──
  const play = { file: "" };
  function openPlay(file) {
    const b = S.boards[file]; if (!b || b.pending) return;
    play.file = file;
    const box = $(".dc-play"); box.hidden = false;
    $(".dc-play-t").textContent = b.title;
    const st = $(".dc-play-stage"), r = st.getBoundingClientRect();
    const z = Math.min(1, (r.width - 40) / b.w, (r.height - 40) / b.h);
    st.innerHTML = `<div class="dc-play-frame" style="width:${b.w * z}px;height:${b.h * z}px"><iframe sandbox="allow-scripts" title="${esc(b.title)}" width="${b.w}" height="${b.h}" style="transform:scale(${z})" src="${BASE}/board/${encodeURIComponent(file)}?mode=play&k=${encodeURIComponent(S.keys[file] || "")}"></iframe></div>`;
  }
  function playKey(key) {
    const list = S.order.filter((f) => S.boards[f] && !S.boards[f].pending && onSheet(S.boards[f])), at = list.indexOf(play.file);
    if (key === "Escape") { $(".dc-play").hidden = true; play.file = ""; }
    if (key === "ArrowRight" && list[at + 1]) openPlay(list[at + 1]);
    if (key === "ArrowLeft" && at > 0) openPlay(list[at - 1]);
  }

  // ── the top bar ──
  root.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-a], [data-sheet]"); if (!t || panel.contains(t)) return;
    if (t.dataset.sheet) { sheet = t.dataset.sheet; select(null); draw(); fit(); return; }
    const a = t.dataset.a;
    if (a === "in") zoomMid(1.25);
    if (a === "out") zoomMid(0.8);
    if (a === "100") zoomMid(1 / cam.z);
    if (a === "fit") fit();
    if (a === "sticky") await addSticky();
    if (a === "comment") setCommentMode(!commentMode);
    if (a === "comments") { side = side === "comments" ? "inspect" : "comments"; drawPanel(); }
    if (a === "versions") { side = side === "versions" ? "inspect" : "versions"; drawPanel(); }
    if (a === "preview") { const f = sel && sel.file && S.boards[sel.file] ? sel.file : S.order.find((x) => S.boards[x] && !S.boards[x].pending && onSheet(S.boards[x])); if (f) openPlay(f); else say("Nothing drawn yet"); }
    if (a === "addpage") { const title = prompt("Page title"); if (title && title.trim()) { const r = await layout([{ op: "sheet", title: title.trim() }]); if (r.made && r.made[0]) { sheet = r.made[0]; draw(); fit(); } } }
    if (a === "play-close") playKey("Escape");
    if (a === "play-next") playKey("ArrowRight");
    if (a === "play-prev") playKey("ArrowLeft");
  });
  root.addEventListener("dblclick", async (e) => {
    const t = e.target.closest("[data-sheet]"); if (!t) return;
    const p = S.sheets.find((x) => x.id === t.dataset.sheet);
    const title = prompt("Rename the page (empty: remove it if nothing is on it)", p.title || "Page 1");
    if (title === null) return;
    if (!title.trim()) await layout([{ op: "removeSheet", id: p.id }]);
    else await layout([{ op: "sheet", id: p.id, title: title.trim() }]);
  });

  window.__designCanvas = { get state() { return S; }, get camera() { return cam; }, fit, refresh };
  draw();
  if (!stored) fit(); else apply();
  drawPanel();
})();
