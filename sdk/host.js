// The page around the design canvas in Hyper: what Speca's own page scripts (web/assets/js base.js, live.js, app.js,
// menus.js) give a canvas tab, and nothing else — the canvas itself is Speca's client (dcv.js and its parts), served
// unchanged. Here: toasts (dh-toast), live regions over Hyper's event stream (data-live-topic → dh-live, as Speca's
// live.js does over its own), the version chip's history drawer and its rename/close/dialog actions, and
// window.dhCompose — "Ask the agent" and the like put text into Hyper's chat composer beside this frame.
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ── toasts (base.js) ──
  function toast(title, description = "", category = "success") {
    const t = $("#toaster");
    if (t && t.toast) t.toast({ category, title, description });
    else if (t) { const d = document.createElement("div"); d.className = "toast-lite"; d.textContent = title + (description ? " — " + description : ""); t.appendChild(d); setTimeout(() => d.remove(), 4000); }
  }
  window.dhToast = toast;
  document.addEventListener("dh-toast", (e) => toast(e.detail.title, e.detail.description, e.detail.category));
  document.addEventListener("dh-reload", () => location.reload());
  document.addEventListener("dh-close-dialog", () => $("#dlg")?.close());

  // ── "this element" into the chat: Hyper's composer (#input in form[data-form=chat]) in the page around this frame ──
  window.dhCompose = (text, o = {}) => {
    let doc = null;
    try { doc = window.parent !== window ? window.parent.document : null; } catch { doc = null; }
    const cin = doc && (doc.querySelector('form[data-form="chat"] textarea[name="text"]') || doc.getElementById("input"));
    if (!cin) { navigator.clipboard?.writeText(text).catch(() => {}); toast(document.documentElement.lang === "ru" ? "Ссылка на элемент скопирована — вставьте её в чат" : "The element's address is copied — paste it into the chat"); return; }
    const v = cin.value.trim();
    cin.value = o.at === "start" ? `${text} ${v}`.trimEnd() + " " : `${v ? v + " " : ""}${text} `;
    cin.dispatchEvent(new Event("input", { bubbles: true }));
    cin.focus(); cin.setSelectionRange(cin.value.length, cin.value.length);
  };

  // ── live regions (live.js) over Hyper's stream: GET /procs/events?topics=… sends {type:"refresh", topic} ──
  let es = null, key = "", beat = 0;
  const pending = new Map();
  const regionTopics = () => [...new Set($$("[data-live-topic]").flatMap((el) => el.dataset.liveTopic.split(/\s+/).filter(Boolean)))].sort();
  function signal(topic) {
    for (const el of $$("[data-live-topic]")) {
      if (!el.dataset.liveTopic.split(/\s+/).includes(topic)) continue;
      // looking at a version, a moment of the draft or a comparison: a refresh would throw the person back to the draft
      if (el.id === "canvas-in" && el.querySelector("#cbody .ver-banner")) continue;
      clearTimeout(pending.get(el));
      pending.set(el, setTimeout(() => { if (el.isConnected) window.htmx.trigger(el, "dh-live"); }, 100));
    }
  }
  function connect() {
    if (document.hidden) return;
    const topics = regionTopics(), k = topics.join(",");
    if (es && k === key) return;
    es?.close(); es = null; key = k;
    if (!topics.length) return;
    let opened = false;
    es = new EventSource("/procs/events?topics=" + encodeURIComponent(k));
    beat = Date.now();
    es.onmessage = (m) => {
      beat = Date.now();
      let e; try { e = JSON.parse(m.data); } catch { return; }
      if (e.type === "hello") { if (opened) regionTopics().forEach(signal); opened = true; return; }
      if (e.topic) signal(e.topic);
    };
  }
  setInterval(() => { if (es && !document.hidden && Date.now() - beat > 70_000) { es.close(); es = null; key = ""; connect(); } }, 10_000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) { es?.close(); es = null; key = ""; } else { connect(); regionTopics().forEach(signal); } });
  document.addEventListener("htmx:afterSettle", () => setTimeout(connect, 150));
  addEventListener("pagehide", () => es?.close());

  // ── the history drawer (menus.js verPlace / verShow) ──
  let verOpen = false;
  function verPlace(d) {
    const body = $("#cbody"), p = d.offsetParent;
    if (!body || !p) return;
    const b = body.getBoundingClientRect(), pr = p.getBoundingClientRect(), head = body.querySelector(".doc > .doc-h, .bare-ver")?.getBoundingClientRect();
    const top = (head && head.bottom > b.top && head.bottom < b.bottom ? head.bottom : b.top) + 8;
    d.style.top = `${top - pr.top}px`; d.style.height = ""; d.style.maxHeight = `${Math.max(160, Math.min(b.bottom, innerHeight) - 8 - top)}px`;
  }
  function verShow(on, now = false) {
    verOpen = on;
    $$('[data-act="ver-drawer"][aria-controls]').forEach((x) => x.setAttribute("aria-expanded", String(on)));
    const d = $("#verdrawer");
    if (!d) return;
    if (on) { d.hidden = false; verPlace(d); if (now) d.classList.add("in", "now"); else requestAnimationFrame(() => d.classList.add("in")); }
    else { d.classList.remove("in", "now"); setTimeout(() => { if (!verOpen) d.hidden = true; }, 180); }
  }
  document.addEventListener("htmx:afterSettle", () => { if (verOpen) verShow(true, true); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && verOpen && !e.target.closest?.("input, textarea, dialog[open]")) verShow(false); });
  document.addEventListener("click", (e) => { if (verOpen && e.target.isConnected && !e.target.closest("#verdrawer, [data-act=ver-drawer], dialog, .toaster")) verShow(false); });
  addEventListener("resize", () => { const d = $("#verdrawer"); if (verOpen && d) verPlace(d); });
  // "N older versions": the rest of the list (menus.js)
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-act=vd-more]"); if (!b) return;
    b.closest(".vd-list")?.querySelectorAll("[data-vd-old]").forEach((x) => { x.hidden = false; });
    b.closest(".vd-more")?.remove();
  });

  // ── dialogs (app.js openDialog) ──
  async function openDialog(url) {
    const dlg = $("#dlg"), body = $("#dlg-body"); if (!dlg || !body) return;
    const r = await fetch(url).catch(() => null); if (!r?.ok) return;
    body.innerHTML = await r.text(); window.htmx.process(body);
    if (!dlg.open) dlg.showModal();
  }
  $("#dlg")?.addEventListener("click", (e) => { if (e.target.id === "dlg") e.target.close(); });

  // ── the page's actions (app.js) ──
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act],[data-dialog]");
    if (!a) return;
    if (a.hasAttribute("data-dialog")) { e.preventDefault(); openDialog(a.dataset.dialog); return; }
    switch (a.dataset.act) {
      case "ver-drawer": verShow(!verOpen); break;
      case "vp-close": a.closest("details.verpop")?.removeAttribute("open"); break;
      case "close-dialog": $("#dlg")?.close(); break;
      case "ver-rename": {
        const row = a.closest(".vp-vrow, .jr-row, .vd-i"), f = row?.querySelector("form.ver-name"), inp = f?.querySelector("input");
        if (!f || !inp) break;
        row.classList.add("renaming"); f.hidden = false; inp.focus(); inp.select();
        const done = () => { row.classList.remove("renaming"); f.hidden = true; };
        inp.onkeydown = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); inp.value = inp.defaultValue; done(); } };
        inp.onblur = () => setTimeout(() => { if (!f.hidden && document.activeElement !== inp) { inp.value = inp.defaultValue; done(); } }, 150);
        f.addEventListener("htmx:afterRequest", (ev) => { if (!ev.detail.successful) return; inp.defaultValue = inp.value; done(); if (f.dataset.journal && f.closest("#dlg-body")) openDialog(f.dataset.journal); }, { once: true });
        break;
      }
    }
  });
  // a journal action (delete a version): the journal is drawn again
  document.addEventListener("htmx:afterRequest", (e) => { const j = e.detail.elt?.dataset?.journal; if (j && e.detail.successful && e.detail.elt.closest("#dlg-body") && e.detail.elt.tagName !== "FORM") openDialog(j); });
  // a button that started something is busy until it is answered (base.js)
  document.addEventListener("htmx:beforeRequest", (e) => { const b = e.detail.elt; if (b?.classList?.contains("btn")) b.setAttribute("aria-busy", "true"); });
  document.addEventListener("htmx:afterRequest", (e) => { const b = e.detail.elt; if (b?.classList?.contains("btn")) b.removeAttribute("aria-busy"); });

  connect();
})();
