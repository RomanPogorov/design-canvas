// The design canvas's clipboard and element sizes: cut, copy and paste elements (after the selection, inside a
// container or an artboard, or in place of the selection — across artboards and tabs, kept in localStorage), and the
// handles on the selected element's ring that drag its width and height (one undo step per paste or drag).
(() => {
  const V = (document.currentScript && new URL(document.currentScript.src, location.href).searchParams.get("v")) || "";
  ((window.__dcvParts ||= {})[V] ||= {}).clip = (host) => {
    const { stage, tab, say, post, frame, act, edit, reload, want, commit } = host;
    // elements (KEY) and whole artboards (BOARDS) are kept apart; the one copied last is what ⌘V pastes on a board
    const KEY = "dcv.clip", BOARDS = "dcv.boards";
    const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
    const stored = () => { const c = read(KEY); return c && typeof c.html === "string" && c.html ? c : null; };
    const storedBoards = () => { const c = read(BOARDS); return c && Array.isArray(c.clip?.boards) && c.clip.boards.length ? c : null; };
    const hasClip = () => !!stored();
    const boardsLast = () => { const b = storedBoards(); return !!b && (b.at || 0) > (stored()?.at || 0); };

    // ── copy, cut, paste ──
    const copySel = async () => {
      const s = host.sel; if (!s || s.info.tag === "artboard") return false;
      await commit();
      const r = await post(`/p/design-canvas/copy/${tab}`, { file: s.file, tids: s.own || [s.info.tid] });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { say(host.L[`err_${j.error}`] || host.L.notSaved, "error"); return false; }
      try { localStorage.setItem(KEY, JSON.stringify({ html: j.html, n: j.n, at: Date.now() })); } catch { say(host.L.notSaved, "error"); return false; }
      return j.n;
    };
    const copyEl = async () => { const n = await copySel(); if (n) say(host.L.clipCopied.replace("{n}", n)); };
    const cutEl = async () => { if (host.ro) return; const n = await copySel(); if (!n) return; await act("delete"); say(host.L.clipCut.replace("{n}", n)); };
    // where it goes: inside an artboard (its root) or a container, else right after the selection; or in its place
    const paste = async (instead) => {
      const s = host.sel; if (!s || host.ro) return;
      const c = stored(); if (!c) return say(host.L.clipEmpty, "info");
      const board = s.board, art = s.info.tag === "artboard";
      if (instead && art) return;
      await commit();
      const mode = instead ? "replace" : art || s.info.group ? "inside" : "after";
      const j = await edit(board, { op: "paste", tids: [art ? 0 : s.info.tid], snippet: c.html, mode });
      if (!j) return;
      want.set(board, { tid: j.select ?? 0, item: null });
      reload(board, j.v, j.k);
      say(host.L.clipPasted, "success");
    };

    // ── whole artboards: ⌘C on one or several picked boards, ⌘V on any design canvas (another chat's too) ──
    const pickedFiles = () => {
      // the boards picked on the canvas (shift-click, marquee); else the one artboard selected
      const many = [...host.picked].filter((n) => n.classList.contains("dcv-board")).map((n) => n.dataset.file);
      if (many.length) return many;
      return host.sel?.info.tag === "artboard" ? [host.sel.file] : [];
    };
    // the system clipboard gets the artboards' address (the tab and their files) with their titles as the text: a canvas
    // of another kind that takes pages in (a design editor) reads it on ⌘V and asks the server for the pages themselves.
    // Written at once, while the key press still allows it
    const mark = (files) => {
      const titles = files.map((f) => stage.querySelector(`.dcv-board[data-file="${CSS.escape(f)}"]`)?.dataset.title || f).join("\n");
      const note = document.createElement("div");
      note.dataset.specaPages = JSON.stringify({ tab, parts: files }); note.textContent = titles;
      const put = (e) => { e.clipboardData.setData("text/html", note.outerHTML); e.clipboardData.setData("text/plain", titles); e.preventDefault(); };
      // the key may have come from inside an artboard (its frame has the focus): the copy is this page's
      if (document.activeElement?.tagName === "IFRAME") { document.activeElement.blur(); window.focus(); }
      let ok = false;
      document.addEventListener("copy", put, true);
      try { ok = document.execCommand("copy"); } catch {}
      document.removeEventListener("copy", put, true);
      if (!ok) navigator.clipboard?.write?.([new ClipboardItem({ "text/html": new Blob([note.outerHTML], { type: "text/html" }), "text/plain": new Blob([titles], { type: "text/plain" }) })]).catch(() => {});
    };
    const copyBoards = async () => {
      const files = pickedFiles(); if (!files.length) return false;
      await commit();
      const r = await post(`/p/design-canvas/copy/${tab}`, { files });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.boards) { say(host.L.notSaved, "error"); return true; }
      try { localStorage.setItem(BOARDS, JSON.stringify({ clip: j, at: Date.now() })); } catch { say(host.L.notSaved, "error"); return true; }
      say((host.L.boardsCopied || host.L.clipCopied).replace("{n}", j.boards.length));
      return true;
    };
    const pasteBoards = async () => {
      const c = storedBoards(); if (!c || host.ro) return;
      await commit();
      const r = host.stage.getBoundingClientRect();
      const at = host.toWorld(r.left + r.width / 2, r.top + r.height / 2);
      const j = await host.layout({ op: "pasteBoards", clip: c.clip, at: { x: Math.round(at.x), y: Math.round(at.y) }, sheet: host.sheet });
      if (j?.files) say((host.L.boardsPasted || host.L.clipPasted).replace("{n}", j.files.length), "success");
    };

    // ── handles on the selected element: right edge (width), bottom edge (height), the corner (both) ──
    let drag = null;
    const RATIO = /^(img|video|svg|picture|canvas|iframe)$/;
    const decorate = (ring, info) => {
      if (host.ro || !info || info.tag === "artboard" || (host.sel?.own?.length || 1) > 1) return;
      for (const a of ["e", "s", "se"]) { const h = document.createElement("span"); h.className = "dcv-erz"; h.dataset.erz = a; ring.append(h); }
      if (drag) { const t = document.createElement("span"); t.className = "dcv-esz"; t.textContent = `${drag.w} × ${drag.h}`; ring.append(t); }
    };
    const px = (v, fb) => { const n = Number.parseFloat(v); return Number.isFinite(n) && /px$/.test(String(v)) ? n : fb; };
    stage.addEventListener("pointerdown", (e) => {
      const h = e.target.closest?.(".dcv-erz"); if (!h || e.button !== 0 || host.ro || !host.sel) return;
      e.preventDefault(); e.stopPropagation();
      const s = host.sel, b = s.board, r = s.info.rect, c = s.probe?.computed || {};
      const w0 = Math.round(px(c.width, r.w)), h0 = Math.round(px(c.height, r.h));
      drag = { axis: h.dataset.erz, x: e.clientX, y: e.clientY, k: b.getBoundingClientRect().width / b.offsetWidth || 1, w0, h0, w: w0, h: h0, ratio: RATIO.test(s.info.tag), ch: null, sel: s };
      stage.classList.add("dragging"); stage.style.cursor = getComputedStyle(h).cursor;
    }, true);
    addEventListener("pointermove", (e) => {
      if (!drag) return;
      const d = drag, dx = (e.clientX - d.x) / d.k, dy = (e.clientY - d.y) / d.k, keep = d.ratio || e.shiftKey;
      let w = d.axis === "s" ? d.w0 : Math.max(1, Math.round(d.w0 + dx)), h = d.axis === "e" ? d.h0 : Math.max(1, Math.round(d.h0 + dy));
      if (keep && d.w0 && d.h0) { if (d.axis === "s") w = Math.max(1, Math.round(h * d.w0 / d.h0)); else h = Math.max(1, Math.round(w * d.h0 / d.w0)); }
      d.w = w; d.h = h;
      // a proportional drag sets both sides; an edge sets its own side
      d.ch = keep || d.axis === "se" ? { width: `${w}px`, height: `${h}px` } : d.axis === "e" ? { width: `${w}px` } : { height: `${h}px` };
      frame(d.sel.board)?.postMessage({ __dcvHost: { t: "preview", tids: d.sel.tids, changes: d.ch } }, "*");
    });
    const end = () => {
      if (!drag) return;
      const d = drag; drag = null; stage.classList.remove("dragging"); stage.style.cursor = "";
      // the frame re-reports the selection while it previews: the same element, a fresh object
      if (d.ch && host.sel?.board === d.sel.board && host.sel.info.tid === d.sel.info.tid) host.change(d.ch, true);
      else frame(d.sel.board)?.postMessage({ __dcvHost: { t: "rollback" } }, "*");
    };
    addEventListener("pointerup", end); addEventListener("pointercancel", end);

    // the keys: ⌘C, ⌘X, ⌘V and ⇧⌘V (the host calls this before its own)
    const clipKey = (k) => {
      if (!k.meta || k.alt) return false;
      const key = k.key.toLowerCase();
      // artboards: picked ones copied; pasted where no element is picked (the canvas, or an artboard as a whole)
      const onBoards = !host.sel || host.sel.info.tag === "artboard";
      if (key === "c" && !k.shift && onBoards && pickedFiles().length) { mark(pickedFiles()); void copyBoards(); return true; }
      if (key === "v" && !k.shift && onBoards && (!host.sel || boardsLast()) && storedBoards()) { if (!k.repeat) void pasteBoards(); return true; }
      if (!host.sel) return false;
      if (key === "c" && !k.shift) { void copyEl(); return true; }
      if (key === "x" && !k.shift) { void cutEl(); return true; }
      if (key === "v") { if (!k.repeat) void paste(k.shift); return true; }
      return false;
    };
    return { copyEl, cutEl, paste, hasClip, decorate, clipKey, copyBoards, pasteBoards, hasBoards: () => !!storedBoards() };
  };
})();
