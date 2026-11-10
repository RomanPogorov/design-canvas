// Runs inside each artboard frame (sandboxed, 1:1 with the artboard). It finds the element under the pointer and
// tells the host its address (data-tid), the data item of a repeat copy (data-item), its template (data-tpl) and its
// styles; it draws the hover and selection rings itself, on an overlay that is not part of the page. Every copy a
// repeat made shares one tid, so selecting one rings them all. Double-click edits a text in place. In play mode
// (?play=1) it only turns links to other artboards into navigation. Served inline into each frame by boardPage.
(() => {
  const send = (m) => parent.postMessage({ __dc: m }, "*");
  const q = new URLSearchParams(location.search);
  const FILE = /^(?:\.\/)?([A-Za-z0-9_][A-Za-z0-9_.-]*\.html)(?:[?#].*)?$/;
  addEventListener("wheel", (e) => { e.preventDefault(); send({ t: "wheel", dx: e.deltaX, dy: e.deltaY, x: e.clientX, y: e.clientY, zoom: e.ctrlKey || e.metaKey }); }, { passive: false });
  if (q.has("play")) {
    document.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      e.preventDefault();
      const m = FILE.exec(a.getAttribute("href") || "");
      if (m) send({ t: "nav", file: m[1] });
    }, true);
    document.addEventListener("keydown", (e) => send({ t: "key", key: e.key, meta: e.metaKey || e.ctrlKey, shift: e.shiftKey }), true);
    send({ t: "ready", play: true });
    return;
  }
  const INLINE = new Set(["B", "STRONG", "I", "EM", "U", "S", "BR", "A", "CODE", "MARK", "SUB", "SUP", "SMALL", "SPAN"]);
  const PROPS = ["color", "background-color", "font-size", "font-weight", "line-height", "text-align", "padding", "margin", "gap", "border-radius", "width", "height", "display", "flex-direction", "opacity"];
  let selected = [], hovering = null, editing = null, mode = "edit";
  const layer = document.createElement("div");
  layer.setAttribute("data-dc-layer", "");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
  document.documentElement.appendChild(layer);
  const all = (tid) => [...document.querySelectorAll(`[data-tid="${tid}"]`)];
  const target = (node) => { for (let x = node; x && x !== document.documentElement; x = x.parentElement) if (x.dataset && x.dataset.tid !== undefined) return x; return null; };
  const ring = (el, kind) => {
    const r = el.getBoundingClientRect(), d = document.createElement("div");
    d.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;box-sizing:border-box;border:${kind === "sel" ? "2px solid #2563eb" : "1px solid #60a5fa"};${kind === "copy" ? "border-style:dashed;" : ""}border-radius:2px`;
    layer.appendChild(d);
  };
  const draw = () => {
    layer.textContent = "";
    if (hovering && !selected.includes(hovering.dataset.tid)) ring(hovering, "hover");
    for (const tid of selected) all(tid).forEach((el, i) => ring(el, i === 0 || el === selected.el ? "sel" : "copy"));
  };
  addEventListener("scroll", draw, true);
  addEventListener("resize", draw);
  const textOnly = (el) => ![...el.children].some((c) => !INLINE.has(c.tagName)) && !["IMG", "INPUT", "svg", "SVG", "HR", "BR"].includes(el.tagName);
  const describe = (el, e) => {
    const cs = getComputedStyle(el), inline = {};
    for (const s of (el.getAttribute("style") || "").split(";")) { const k = s.indexOf(":"); if (k > 0) inline[s.slice(0, k).trim().toLowerCase()] = s.slice(k + 1).trim(); }
    const computed = {};
    for (const p of PROPS) computed[p] = cs.getPropertyValue(p);
    const up = target(el.parentElement);
    const text = (el.innerText || "").trim().replace(/\s+/g, " ");
    const r = el.getBoundingClientRect();
    return { tid: Number(el.dataset.tid), tag: el.tagName.toLowerCase(), text: text.slice(0, 200), textOnly: textOnly(el), item: el.dataset.item || "", tpl: el.dataset.tpl || "", path: el.dataset.path || "",
      import: el.dataset.import || "", copies: all(el.dataset.tid).length, parentTid: up ? Number(up.dataset.tid) : -1, inline, computed,
      attrs: { href: el.getAttribute("href"), src: el.getAttribute("src"), alt: el.getAttribute("alt"), placeholder: el.getAttribute("placeholder"), "aria-label": el.getAttribute("aria-label") },
      rect: { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }, shift: !!(e && (e.shiftKey || e.metaKey)),
      label: `${el.tagName.toLowerCase()}${text ? ` «${text.slice(0, 40)}»` : ""}` };
  };
  document.addEventListener("pointermove", (e) => { if (editing) return; const t = target(e.target); if (t !== hovering) { hovering = t; draw(); } }, true);
  document.addEventListener("pointerleave", () => { hovering = null; draw(); });
  document.addEventListener("pointerdown", (e) => {
    if (editing && editing.el.contains(e.target)) return;
    if (editing) finish(true);
    e.preventDefault();
    const t = target(e.target);
    if (mode === "comment") {
      const r = t ? describe(t, e) : null;
      send({ t: "comment", tid: t ? Number(t.dataset.tid) : -1, label: r ? r.label : "", fx: e.clientX / innerWidth, fy: (e.clientY + scrollY) / Math.max(innerHeight, document.documentElement.scrollHeight) });
      return;
    }
    if (!t) { selected = []; draw(); send({ t: "deselect" }); return; }
    send({ t: "select", ...describe(t, e) });
  }, true);
  // links, buttons and forms do nothing while editing the design
  document.addEventListener("click", (e) => { if (!editing) e.preventDefault(); }, true);
  document.addEventListener("submit", (e) => e.preventDefault(), true);
  function start(el) {
    if (!textOnly(el)) return;
    const tpl = el.dataset.tpl || "", item = el.dataset.item || "";
    // a copy's text that is one hole edits that value of its data item; another template edits the template itself
    const path = el.dataset.path || "";
    const kind = path ? "data" : tpl ? "template" : "text";
    editing = { el, kind, before: el.innerHTML, tpl, item, path };
    if (kind === "template") el.textContent = tpl;
    el.setAttribute("contenteditable", kind === "text" ? "true" : "plaintext-only");
    el.focus();
    const range = document.createRange(); range.selectNodeContents(el);
    const s = getSelection(); s.removeAllRanges(); s.addRange(range);
    layer.textContent = "";
  }
  function finish(save) {
    if (!editing) return;
    const { el, kind, before, tpl, item, path } = editing;
    editing = null;
    el.removeAttribute("contenteditable");
    if (!save) { el.innerHTML = before; draw(); return; }
    const text = el.innerText.replace(/\n$/, "");
    const m = { t: "text", tid: Number(el.dataset.tid), kind, text, html: el.innerHTML, item, tpl };
    if (kind === "data") m.path = path;
    send(m);
    draw();
  }
  document.addEventListener("dblclick", (e) => { if (mode !== "edit") return; const t = target(e.target); if (t) { e.preventDefault(); start(t); } }, true);
  document.addEventListener("keydown", (e) => {
    if (editing) {
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
      else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finish(true); }
      return;
    }
    if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
    send({ t: "key", key: e.key, meta: e.metaKey || e.ctrlKey, shift: e.shiftKey });
    if (["Delete", "Backspace", " "].includes(e.key) || e.metaKey || e.ctrlKey) e.preventDefault();
  }, true);
  addEventListener("message", (e) => {
    const m = e.data && e.data.__dc;
    if (!m) return;
    if (m.t === "select") { selected = (m.tids || []).map(String); draw(); if (m.report && selected[0]) { const el = all(selected[0])[0]; if (el) send({ t: "select", ...describe(el), refresh: true }); } }
    if (m.t === "clear") { selected = []; draw(); }
    if (m.t === "mode") { mode = m.mode; document.documentElement.style.cursor = mode === "comment" ? "crosshair" : ""; }
    if (m.t === "edit" && m.tid !== undefined) { const el = all(m.tid)[0]; if (el) start(el); }
  });
  send({ t: "ready", h: document.documentElement.scrollHeight });
})();
