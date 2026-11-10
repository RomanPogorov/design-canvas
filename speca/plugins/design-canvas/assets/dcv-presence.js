// Who else is on the design canvas and what the agent draws: the others' cursors and selections (ours goes out a few
// times a second), and the artboard the agent works on under a moving skeleton (a new one as a ghost where it goes).
(() => {
  const V = (document.currentScript && new URL(document.currentScript.src, location.href).searchParams.get("v")) || "";
  ((window.__dcvParts ||= {})[V] ||= {}).presence = (host) => {
    const { root, world, stage, tab, SHOT, post, csrf, boards, allBoards, toWorld, rectSoon, human } = host, { esc } = window.dck;
    // while the agent works, the first waiting artboard says it is being drawn (the chat's head knows)
    const busyT = setInterval(() => {
      if (!root.isConnected) return clearInterval(busyT);
      const busy = !!document.querySelector("#chat-head .st-running, #chat-head .st-waiting");
      root.classList.toggle("agent-busy", busy);
      if (busy) pollWork(); else if (working.size) drawWork([]);
    }, 1000);
    // ── what the agent draws right now (GET /canvas/:tab/work, from its activity): that artboard under a moving
    // skeleton with a tag saying so — or, a board that is not there yet, its ghost where it will go ──
    const working = new Map();   // file → { el: the board (or ghost), ov: the overlay }
    let workBusy = false;
    const thousands = (n) => new Intl.NumberFormat(document.documentElement.lang || undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
    async function pollWork() {
      if (workBusy || SHOT) return;
      workBusy = true;
      try { const r = await fetch(`/canvas/${tab}/work`); if (r.ok) drawWork((await r.json()).work || []); } catch {} finally { workBusy = false; }
    }
    function ghostAt(it) {
      // a new board goes to the right of the last one of the page in its row (as the tool puts it); its size if given
      const list = boards().filter((b) => !b.classList.contains("dcv-ghost"));
      const w = it.w || 390, h = it.h || 844;
      if (!list.length) return { x: 0, y: 0, w, h };
      const last = list.reduce((a, b) => (parseFloat(b.style.top) > parseFloat(a.style.top) + 1 || (Math.abs(parseFloat(b.style.top) - parseFloat(a.style.top)) <= 1 && parseFloat(b.style.left) > parseFloat(a.style.left)) ? b : a));
      return { x: parseFloat(last.style.left) + parseFloat(last.style.width) + 80, y: parseFloat(last.style.top), w, h };
    }
    function drawWork(items) {
      if (!root.isConnected) return;
      const now = new Map(items.filter((i) => i.file).map((i) => [i.file, i]));
      for (const [file, w] of working) if (!now.has(file)) { w.ov.remove(); w.el.classList.remove("dcv-working"); if (w.el.classList.contains("dcv-ghost")) w.el.remove(); working.delete(file); }
      for (const [file, it] of now) {
        let w = working.get(file);
        // the canvas redrew in place (a board drawn, a ghost become real): laid again on what is there now
        const real = allBoards().find((b) => b.dataset.file === file && !b.classList.contains("dcv-ghost"));
        if (w && (!w.el.isConnected || !w.ov.isConnected || (w.el.classList.contains("dcv-ghost") && real))) {
          w.ov.remove(); w.el.classList.remove("dcv-working"); if (w.el.classList.contains("dcv-ghost")) w.el.remove(); working.delete(file); w = undefined;
        }
        if (!w) {
          let el = real;
          if (!el) {
            const p = ghostAt(it);
            el = document.createElement("div"); el.className = "dcv-board dcv-ghost"; el.dataset.file = file; el.dataset.sheet = host.sheet;
            el.style.cssText = `left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px`;
            el.innerHTML = `<div class="dcv-name"><span>${esc(it.title || file.replace(/\.html$/, ""))}</span></div>`;
            world.append(el);
          }
          const ov = document.createElement("div"); ov.className = "dcv-work"; ov.setAttribute("aria-hidden", "true");
          ov.innerHTML = '<div class="dcv-work-sk"><i class="h"></i><i class="l"></i><i class="l s"></i><i class="b"></i><i class="l"></i><i class="l s"></i><i class="c"></i></div><span class="dcv-work-tag" data-side="top"><i class="spin"></i><b></b></span>';
          el.classList.add("dcv-working"); el.append(ov);
          w = { el, ov }; working.set(file, w);
        }
        // the tag: what it does (with whose name, a subagent's), the tooltip: what that means and how far
        const isNew = w.el.classList.contains("dcv-ghost");
        const what = it.phase === "tool" ? host.L.workApply : isNew ? host.L.workNew : host.L.workDraw;
        w.ov.querySelector("b").textContent = `${it.who ? `${it.who} · ` : ""}${what}`;
        const far = it.phase === "tool_input" && it.chars > 200 ? ` · ${(host.L.workChars || "{n}").replace("{n}", thousands(it.chars))}` : "";
        w.ov.querySelector(".dcv-work-tag").dataset.tooltip = `${host.L.workTip || ""}${far}`;
      }
    }
    // ── presence: the others on this canvas — their cursors and selections; ours goes out a few times a second ──
    const liveEl = root.querySelector(".dcv-live"), cursors = root.querySelector(".dcv-cursors"), peersEl = root.querySelector(".dcv-peers");
    // one post at a time: while one is on its way the newest place waits and goes when it is back — a slow server
    // must not collect a pile of them (each holds one of the few connections the page has to the server)
    let mine = {}, sentAt = 0, sendT = 0, inFlight = false, again = false;
    const share = (patch, now) => {
      if (!liveEl?.dataset.liveTopic || SHOT) return;
      mine = patch === null ? null : { ...(mine || {}), ...patch };
      clearTimeout(sendT);
      const go = () => {
        if (inFlight) { again = true; return; }
        inFlight = true; sentAt = Date.now();
        const stop = new AbortController(), t = setTimeout(() => stop.abort(), 15_000);
        fetch(`/p/design-canvas/presence/${tab}`, { method: "POST", signal: stop.signal, headers: { "x-csrf": csrf(), "content-type": "application/json" }, body: JSON.stringify({ state: mine }) })
          .then((r) => (r.ok ? r.json() : null)).then((j) => j && drawPeers(j.people)).catch(() => {})
          .finally(() => { clearTimeout(t); inFlight = false; if (again) { again = false; go(); } });
      };
      if (now || Date.now() - sentAt > 250) go(); else sendT = setTimeout(go, 250 - (Date.now() - sentAt));
    };
    const shareSel = () => share(host.sel ? { file: host.sel.file, rects: host.sel.info.tag === "artboard" ? [] : [host.sel.info.rect, ...(host.sel.rings || [])].slice(0, 20).map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) })), label: human() } : { file: undefined, rects: undefined, label: undefined }, true);
    const hue = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 6; };
    function drawPeers(people) {
      if (!root.isConnected) return;
      const first = (n) => String(n || "?").split(/\s+/)[0];
      cursors.innerHTML = people.filter((p) => Number.isFinite(p.state.x)).map((p) => `<div class="dcv-peer" style="left:${p.state.x}px;top:${p.state.y}px;--pc:var(--dk-peer-${hue(p.userId)})"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 1l5.5 13 2-5.5L14 6.5Z"/></svg><span>${esc(first(p.name))}</span></div>`).join("");
      world.querySelectorAll(".dcv-ring.peer").forEach((n) => n.remove());
      for (const p of people) {
        const b = p.state.file && boards().find((x) => x.dataset.file === p.state.file); if (!b) continue;
        (p.state.rects || []).forEach((r, i) => {
          const n = document.createElement("div"); n.className = "dcv-ring peer"; n.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;--pc:var(--dk-peer-${hue(p.userId)})`;
          if (!i) { const t = document.createElement("span"); t.className = "tag"; t.textContent = first(p.name); n.append(t); }
          b.querySelector(".dcv-rings").append(n);
        });
      }
      peersEl.innerHTML = people.slice(0, 4).map((p) => `<span class="dcv-av" style="--pc:var(--dk-peer-${hue(p.userId)})" data-tooltip="${esc(p.name)}${p.state.label ? ` · ${esc(p.state.label)}` : ""}" data-side="top">${esc(first(p.name).slice(0, 1).toUpperCase())}</span>`).join("") + (people.length ? '<span class="dk-vsep"></span>' : "");
    }
    // (where the stage is not known yet this move is skipped: the next one goes)
    stage.addEventListener("pointermove", (e) => { if (!host.stageR) return rectSoon(); const w = toWorld(e.clientX, e.clientY); share({ x: Math.round(w.x), y: Math.round(w.y) }); });
    stage.addEventListener("pointerleave", () => share({ x: undefined, y: undefined }));
    // the signal is for this element alone: bubbling up it would make #canvas-in re-render the whole canvas
    liveEl?.addEventListener("dh-live", (e) => e.stopPropagation());
    liveEl?.addEventListener("dh-live", () => fetch(`/p/design-canvas/presence/${tab}`).then((r) => (r.ok ? r.json() : null)).then((j) => j && drawPeers(j.people)).catch(() => {}));
    share({}, true);
    const beat = setInterval(() => { if (!root.isConnected) { clearInterval(beat); return; } if (document.visibilityState === "visible") share({}, true); }, 10_000);
    addEventListener("pagehide", () => { if (root.isConnected) fetch(`/p/design-canvas/presence/${tab}`, { method: "POST", keepalive: true, headers: { "x-csrf": csrf(), "content-type": "application/json" }, body: JSON.stringify({ state: null }) }); });
    return { share, shareSel };
  };
})();
