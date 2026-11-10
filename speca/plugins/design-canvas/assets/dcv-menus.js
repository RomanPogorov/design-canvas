// The design canvas's menus (what can be done with the selection, an artboard, the pages; a disabled item says why)
// and its popovers on the stage (naming a component, writing a comment, a comment's thread).
(() => {
  const V = (document.currentScript && new URL(document.currentScript.src, location.href).searchParams.get("v")) || "";
  ((window.__dcvParts ||= {})[V] ||= {}).menus = (host) => {
    // ── menus: what can be done with the selection; a disabled item says why ──
    const { root, stage, menuEl, panel, picked, world, tab, say, post, frame, boards, openBoard, allBoards, firstSheet, goSheet, act, layout, edit, reload, want, asItem, inline, fit, clear, removePicked, exportBoard, openPlay, ask, copy, setMode, kindName } = host, { esc } = window.dck;
    let popEl = null, popAt = null;   // the open popover and where it points: { board, x, y } in board px
    const elementItems = () => {
      const i = host.sel.info, editable = !host.ro, many = host.sel.own?.length > 1, n = i.copies || 1, item = asItem();
      // a part of a repeat is its template: an action on it changes every copy — say so on the item
      const all = (label) => (!item && n > 1 ? `${label} · ${host.L.allN.replace("{n}", n)}` : label);
      return [
        { label: host.L.m_ask, run: ask },
        { label: host.L.m_comment, k: "C", run: () => setMode("comment") },
        ...(editable ? [
          { sep: 1 },
          { label: host.L.m_text, k: "↵", disabled: !i.textual || many, why: host.L.why_text, run: () => frame(host.sel.board)?.postMessage({ __dcvHost: { t: "edit" } }, "*") },
          ...(host.copyEl ? [
            { label: host.L.m_cut, k: "⌘X", run: () => host.cutEl() },
            { label: host.L.m_copyEl, k: "⌘C", run: () => host.copyEl() },
            { label: host.L.m_paste, k: "⌘V", disabled: !host.hasClip?.(), why: host.L.clipEmpty, run: () => host.paste(false) },
            { label: host.L.m_pasteInstead, k: "⇧⌘V", disabled: !host.hasClip?.(), why: host.L.clipEmpty, run: () => host.paste(true) },
          ] : []),
          { label: item ? host.L.m_dupItem : all(host.L.m_dup), k: "⌘D", run: () => act("duplicate") },
          { label: item ? host.L.m_upItem : all(host.L.m_up), k: "⌥↑", run: () => act("move", { dir: "up" }) },
          { label: item ? host.L.m_downItem : all(host.L.m_down), k: "⌥↓", run: () => act("move", { dir: "down" }) },
          { label: all(host.L.m_wrap), k: "⇧A", disabled: !!item, why: host.L.why_repeat, run: () => act("wrap", { layout: "stack" }) },
          { label: all(host.L.m_wrapRow), disabled: !!item, why: host.L.why_repeat, run: () => act("wrap", { layout: "row" }) },
          { label: host.L.m_group, k: "⌘G", disabled: !many || !!item, why: many ? host.L.why_repeat : host.L.why_many, run: () => act("group") },
          { label: host.L.m_ungroup, k: "⇧⌘G", disabled: !i.group || !!item, why: host.L.why_group, run: () => act("unwrap") },
          { label: host.L.m_front, k: "⌘]", disabled: !!item, why: host.L.why_repeat, run: () => act("zorder", { z: "front" }) },
          { label: host.L.m_back, k: "⌘[", disabled: !!item, why: host.L.why_repeat, run: () => act("zorder", { z: "back" }) },
          { label: host.L.m_parent, k: "⇧↵", run: () => frame(host.sel.board)?.postMessage({ __dcvHost: { t: "parent" } }, "*") },
          { sep: 1 },
          ...(i.import ? [{ label: host.L.m_openComp, icon: "component", run: () => openBoard(i.import) }, { label: host.L.m_detach, disabled: i.inRepeat, why: host.L.why_repeat, run: () => act("detach") }]
            : [{ label: host.L.m_makeComp, icon: "component", disabled: i.inRepeat || many, why: i.inRepeat ? host.L.why_repeat : host.L.why_one, run: makeComponent }]),
          ...(i.twins && !many ? [{ label: host.L.makeRepeat.replace("{n}", i.twins.count), icon: "copies", run: makeRepeat }] : []),
        ] : []),
        { label: host.L.m_copy, run: copy },
        ...(editable ? [{ sep: 1 }, { label: item ? host.L.m_delItem : all(host.L.m_del), k: "⌫", danger: 1, run: () => act("delete") }] : []),
      ];
    };
    // ── pages: the menu of the pages button (switch, add, rename, delete an empty one) ──
    const sheetName = (p, i) => p.title || host.L.sheetN.replace("{n}", String(i + 1));
    const sheetItems = () => {
      const list = host.sheets.length ? host.sheets : [{ id: firstSheet(), title: "" }];
      const here = (el) => (el.dataset.sheet || firstSheet()) === host.sheet;
      const empty = !allBoards().some(here) && ![...world.querySelectorAll(".dcv-note")].some(here);
      return [
        { head: host.L.sheets },
        ...list.map((p, i) => ({ label: sheetName(p, i), icon: p.id === host.sheet ? "check" : undefined, run: () => goSheet(p.id) })),
        ...(host.ro ? [] : [{ sep: 1 },
          { label: host.L.newSheet, run: async () => { const j = await layout({ op: "sheet", title: host.L.sheetN.replace("{n}", String(list.length + 1)) }); if (j?.id) { host.wantSheet = j.id; } } },
          ...(list.length > 1 ? [
            { label: host.L.renameSheet, run: () => { const n = root.querySelector(".dcv-sname"); if (n) inline(n, (t) => layout({ op: "sheet", id: host.sheet, title: t })); } },
            { label: host.L.removeSheet, danger: 1, disabled: !empty, why: host.L.sheetNotEmpty, run: () => layout({ op: "removeSheet", id: host.sheet }) },
          ] : [])]),
      ];
    };
    const boardItems = () => {
      const b = host.sel.board, waiting = b.classList.contains("pending");
      return [
        { label: host.L.m_play, run: () => openPlay(b.dataset.file) },
        { label: host.L.m_ask, run: ask },
        ...(host.ro ? [] : [
          { label: host.L.m_rename, run: () => inline(b.querySelector(".dcv-name span"), (t) => layout({ op: "rename", file: b.dataset.file, title: t })) },
          { label: host.L.m_dupBoard, k: "⌘D", run: () => layout({ op: "duplicate", file: b.dataset.file }) },
          { label: host.L.m_paste, k: "⌘V", disabled: !host.hasClip?.(), why: host.L.clipEmpty, run: () => host.paste(false) },
          // to another page of the canvas (the selected artboards along with it)
          ...(host.sheets.length > 1 ? host.sheets.filter((p) => p.id !== host.sheet).map((p) => ({ label: host.L.toSheet.replace("{name}", sheetName(p, host.sheets.indexOf(p))), run: () => {
            const files = [...new Set([b, ...[...picked].filter((x) => x.classList?.contains("dcv-board"))].map((x) => x.dataset.file))];
            clear(); layout({ op: "toSheet", files, sheet: p.id });
            // that page fits its artboards next time it is shown
            sessionStorage.removeItem(`dcv-cam:${tab}${p.id === firstSheet() ? "" : `:${p.id}`}`);
          } })) : []),
        ]),
        { label: host.L.m_zoomTo, k: "⇧2", run: () => fit([b]) },
        ...(host.ro ? [] : [{ label: host.L.m_repeatAll, icon: "copies", run: async () => { const j = await edit(b, { op: "repeatAll" }); if (j) { reload(b, j.v, j.k); say(host.L.repeatsMade.replace("{n}", j.made)); } } }]),
        { label: host.L.m_copy, run: copy },
        { sep: 1 },
        ...(waiting ? [] : [
        { label: host.L.m_png, icon: "download", run: () => exportBoard(b, "png") },
        { label: host.L.m_svg, icon: "download", run: () => exportBoard(b, "svg") },
        { label: host.L.m_html, icon: "download", run: () => { location.href = `/p/design-canvas/export/${tab}/${encodeURIComponent(b.dataset.file)}`; } }]),
        ...(host.ro ? [] : [{ sep: 1 }, { label: host.L.m_delBoard, k: "⌫", danger: 1, run: () => { clear(); layout({ op: "remove", file: b.dataset.file }); } }]),
      ];
    };
    const pickedItems = () => host.ro ? [] : [{ label: host.L.m_del, k: "⌫", danger: 1, run: removePicked }];
    function openMenu(x, y, items) {
      if (!items.length) return closeMenu();
      menuEl.innerHTML = window.dck.menu(items);
      menuEl.hidden = false;
      window.dck.place(menuEl, root, x, y);
      menuEl.onclick = (e) => { const b = e.target.closest("[data-i]"); if (!b || b.getAttribute("aria-disabled") === "true") return; closeMenu(); items[Number(b.dataset.i)].run(); };
      menuEl.querySelector(".dk-mi:not([aria-disabled])")?.focus();
    }
    function closeMenu() { menuEl.hidden = true; }
    addEventListener("pointerdown", (e) => { if (!menuEl.hidden && !menuEl.contains(e.target)) closeMenu(); }, true);
    addEventListener("blur", closeMenu);
    menuEl.addEventListener("keydown", (e) => {
      const list = [...menuEl.querySelectorAll(".dk-mi:not([aria-disabled])")], at = list.indexOf(document.activeElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); list[(at + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus(); }
      if (e.key === "Escape") { e.stopPropagation(); closeMenu(); stage.focus(); }
    });

    // ── popovers on the stage: naming a component, writing a comment, a comment's thread ──
    function openPop(at, html, onClick, focus) {
      closePop();
      popEl = document.createElement("div"); popEl.className = "dk-pop dcv-pop"; popEl.innerHTML = html; popAt = at;
      stage.append(popEl); placePop();
      popEl.addEventListener("click", onClick);
      popEl.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Escape") { closePop(); stage.focus(); }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey || e.target.tagName === "INPUT")) { e.preventDefault(); (popEl.querySelector(".dk-primary[data-pop-ok]") ?? popEl.querySelector("[data-pop-ok]"))?.click(); }
      });
      if (focus) popEl.querySelector(focus)?.focus();
    }
    function placePop() {
      if (!popEl || !popAt) return;
      const sr = stage.getBoundingClientRect(), br = popAt.board.getBoundingClientRect(), k = br.width / popAt.board.offsetWidth;
      const x = br.left - sr.left + popAt.x * k, y = br.top - sr.top + popAt.y * k;
      popEl.style.left = `${Math.max(8, Math.min(x + 14, stage.clientWidth - popEl.offsetWidth - 8 - (panel.open ? 308 : 0)))}px`;
      popEl.style.top = `${Math.max(8, Math.min(y - 8, stage.clientHeight - popEl.offsetHeight - 8))}px`;
    }
    function closePop() { popEl?.remove(); popEl = null; popAt = null; }
    addEventListener("pointerdown", (e) => { if (popEl && !popEl.contains(e.target) && !e.target.closest(".dcv-pin")) closePop(); }, true);

    // every artboard: its alike hand-written copies → repeats (one undo step per artboard)
    const repeatEvery = async () => {
      let n = 0;
      for (const b of boards()) {
        const r = await post(`/p/design-canvas/edit/${tab}`, { file: b.dataset.file, v: b.dataset.v, op: "repeatAll" });
        if (!r.ok) continue;
        const j = await r.json(); n += j.made || 0; b.dataset.v = j.v; reload(b, j.v, j.k);
      }
      say(n ? host.L.repeatsMade.replace("{n}", n) : host.L.err_no_twins, n ? "success" : "info");
    };
    // hand-written copies → one template and data; the same element is selected again, now with all its copies
    const makeRepeat = async () => {
      if (!host.sel?.info.twins || host.ro) return;
      const s = host.sel, t = s.info.twins, j = await edit(s.board, { op: "repeat", tid: t.tid });
      if (!j) return;
      want.set(s.board, { tid: j.select, item: `${j.key}.${t.index}`, sub: t.sub });
      reload(s.board, j.v, j.k); say(host.L.repeatMade.replace("{n}", t.count));
    };
    const makeComponent = () => {
      const i = host.sel.info, s = host.sel, guess = `${kindName(i.kind)}${i.text ? ` ${i.text.split(" ").slice(0, 3).join(" ")}` : ""}`;
      openPop({ board: s.board, x: i.rect.x + i.rect.w, y: i.rect.y }, `<div class="dk-pop-h"><span class="dk-grow">${esc(host.L.m_makeComp)}</span></div>
        ${window.dck.input({ value: guess, "data-name": "1", "aria-label": host.L.compName })}<div class="dk-note">${esc(host.L.compHint)}</div>
        <div class="dk-pop-f"><span class="dk-grow"></span>${window.dck.btn({ label: host.L.cancel, "data-pop-x": "1" })}${window.dck.btn({ label: host.L.create, primary: true, "data-pop-ok": "1" })}</div>`,
      async (e) => {
        if (e.target.closest("[data-pop-x]")) return closePop();
        if (!e.target.closest("[data-pop-ok]")) return;
        const title = popEl.querySelector("[data-name]").value.trim() || guess; closePop();
        const j = await edit(s.board, { op: "componentize", tid: i.tid, title, w: Math.max(40, Math.round(i.rect.w)), h: Math.max(40, Math.round(i.rect.h)) });
        if (j) { want.set(s.board, { tid: i.tid }); reload(s.board, j.v, j.k); say(host.L.compMade.replace("{name}", title)); }
      }, "[data-name]");
      popEl?.querySelector("[data-name]")?.select();
    };
    return { elementItems, sheetItems, boardItems, pickedItems, openMenu, closeMenu, openPop, placePop, closePop, repeatEvery, makeRepeat, get popEl() { return popEl; } };
  };
})();
