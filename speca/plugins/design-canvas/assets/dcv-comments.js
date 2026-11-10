// The design canvas's comments: pins on elements, a thread each, "send to the agent". The comments are the core's
// (one store for every canvas: /canvas/:tab/comments); a pin keeps what it needs in anchor.design.
(() => {
  const V = (document.currentScript && new URL(document.currentScript.src, location.href).searchParams.get("v")) || "";
  ((window.__dcvParts ||= {})[V] ||= {}).comments = (host) => {
    const { root, stage, tab, me, say, csrf, ago, boards, frame, openPop, closePop, kindName } = host, { esc } = window.dck;
    let comments = {}, showResolved = false;
    // the anchor's path is the artboard address
    const postForm = (url, data) => fetch(url, { method: "POST", headers: { "x-csrf": csrf() }, body: new URLSearchParams(data) }).then((r) => r.ok).catch(() => false);
    const fromCore = (c) => {
      const d = c.anchor.design || {};
      return { file: d.file || String(c.anchor.path || "").split("#")[0], tid: d.tid ?? -1, path: d.path || "", fp: d.fp ?? c.anchor.text ?? "", fx: c.anchor.fx, fy: c.anchor.fy, px: d.px, py: d.py,
        label: c.label, text: c.body, by: c.mine ? me : c.author, byName: c.mine ? host.L.you : c.name, at: c.at, resolved: c.resolved, mine: c.mine, sent: c.sent, relay: !!c.relay,
        replies: (c.replies || []).map((r) => ({ byName: r.mine ? host.L.you : r.name, text: r.text, at: r.at })) };
    };
    const loadComments = async () => {
      const r = await fetch(`/canvas/${tab}/comments?all=1`).catch(() => null);
      if (!r?.ok) return;
      comments = Object.fromEntries(((await r.json()).comments || []).map((c) => [c.id, fromCore(c)]));
      for (const b of boards()) locate(b);
      countBadge();
    };
    const openComments = () => Object.entries(comments).filter(([, c]) => showResolved || !c.resolved);
    const countBadge = () => {
      const n = Object.values(comments).filter((c) => !c.resolved).length, b = root.querySelector(".dcv-cbadge"); if (b) { b.textContent = String(n); b.hidden = !n; }
      // the ones kept for later: one press sends them all to the agent
      const kept = Object.values(comments).filter((c) => c.mine && !c.sent && !c.resolved).length, sa = root.querySelector(".dcv-sendall");
      if (sa) { sa.hidden = !kept || host.ro; sa.querySelector("span").textContent = (host.L.sendAll || "").replace("{n}", kept); }
    };
    const locate = (b) => {
      const list = openComments().filter(([, c]) => c.file === b.dataset.file);
      b.querySelectorAll(".dcv-pin").forEach((n) => n.remove());
      if (list.length) frame(b)?.postMessage({ __dcvHost: { t: "locate", items: list.map(([id, c]) => ({ id, tid: c.tid, fp: c.fp, fx: c.fx, fy: c.fy })) } }, "*");
    };
    // a pin where its element is now; when the element is gone, where it was put
    const placePins = (b, items) => {
      b.querySelectorAll(".dcv-pin").forEach((n) => n.remove());
      for (const it of items) {
        const c = comments[it.id]; if (!c) continue;
        const x = it.x ?? c.px ?? c.fx * b.offsetWidth, y = it.y ?? c.py ?? c.fy * b.offsetHeight;
        const n = document.createElement("button"); n.type = "button"; n.className = `dcv-pin${c.resolved ? " resolved" : ""}${c.mine && !c.sent && !c.resolved ? " unsent" : ""}`; n.dataset.c = it.id;
        n.style.left = `${x}px`; n.style.top = `${y}px`; n.textContent = (c.byName || "?").slice(0, 1).toUpperCase();
        n.setAttribute("aria-label", c.text.slice(0, 80));
        b.append(n);
      }
    };
    stage.addEventListener("click", (e) => { const p = e.target.closest(".dcv-pin"); if (p) thread(p.closest(".dcv-board"), p.dataset.c); });
    const pinLabel = (b, m) => m.tid < 0 ? b.dataset.title : `${b.dataset.title} › ${kindName(m.kind)}${m.text ? ` «${m.text}»` : ""}`;
    const address = (c) => (c.tid >= 0 ? `${c.file}#${c.tid}:${c.path}` : c.file);
    const compose = (b, m) => {
      const label = pinLabel(b, m), toAgent = localStorage.getItem("dcv-cmt-agent") !== "0";
      openPop({ board: b, x: m.x, y: m.y }, `<div class="dk-pop-h"><span class="dk-grow" title="${esc(label)}">${esc(label)}</span></div>
        ${window.dck.textarea({ placeholder: host.L.commentPh, "data-text": "1", rows: "3" })}
        <div class="dk-pop-f"><span class="dk-grow"></span>${window.dck.btn({ label: host.L.add, primary: !toAgent, "data-pop-ok": "add", title: host.L.addHint })}${window.dck.btn({ label: host.L.toAgent, icon: "send", primary: toAgent, "data-pop-ok": "send" })}</div>`,
      async (e) => {
        // Enter in the box: the way used last time; a button: that one
        const btn = e.target.closest("[data-pop-ok]"); if (!btn) return;
        const text = host.popEl.querySelector("[data-text]").value.trim(); if (!text) return;
        const agent = btn.dataset.popOk === "send"; localStorage.setItem("dcv-cmt-agent", agent ? "1" : "0");
        closePop();
        const c = { file: b.dataset.file, tid: m.tid, path: m.path || "", fp: m.fp || "", fx: Math.min(1, Math.max(0, m.fx)), fy: Math.min(1, Math.max(0, m.fy)), px: m.x, py: m.y };
        const ok = await postForm(`/canvas/${tab}/comments`, { body: text, label, path: address(c), text: c.fp, fx: String(c.fx), fy: String(c.fy),
          design: JSON.stringify({ file: c.file, tid: c.tid, path: c.path, fp: c.fp, px: c.px, py: c.py }), ...(agent ? { send: "1" } : {}) });
        if (!ok) return say(host.L.notSaved || "!", "error");
        if (agent) say(host.L.sentToAgent);
        await loadComments();
      }, "[data-text]");
    };
    const thread = (b, id) => {
      const c = comments[id]; if (!c) return;
      const entries = [{ who: c.byName, when: ago(c.at, host.L), text: c.text }, ...(c.replies || []).map((r) => ({ who: r.byName, when: ago(r.at, host.L), text: r.text }))];
      const pin = b.querySelector(`.dcv-pin[data-c="${id}"]`);
      openPop({ board: b, x: pin ? Number.parseFloat(pin.style.left) : 0, y: pin ? Number.parseFloat(pin.style.top) : 0 }, `<div class="dk-pop-h"><span class="dk-grow" title="${esc(c.label)}">${esc(c.label)}</span>
          ${host.ro ? "" : (c.resolved ? window.dck.ib({ icon: "undo", label: host.L.reopen, "data-reopen": "1" }) : window.dck.ib({ icon: "check", label: host.L.resolve, "data-resolve": "1" }))}${!host.ro && c.mine ? window.dck.ib({ icon: "trash", label: host.L.m_del, "data-del": "1" }) : ""}</div>
        ${window.dck.comment(entries[0])}${String(c.by || "").startsWith("plugin:") ? `<div class="dcv-cmt-from">${esc(c.relay ? host.L.fromOutsideRelay : host.L.fromOutside)}</div>` : ""}${entries.slice(1).map(window.dck.comment).join("")}
        ${host.ro ? "" : `${window.dck.textarea({ placeholder: host.L.replyPh, "data-text": "1", rows: "2" })}<div class="dk-pop-f">${c.sent ? `<span class="dcv-cmt-sent">${esc(host.L.sentToAgent)}</span>` : window.dck.btn({ label: host.L.toAgentNow, icon: "send", "data-send": "1" })}<span class="dk-grow"></span>${window.dck.btn({ label: host.L.reply, "data-pop-ok": "1" })}</div>`}`,
      async (e) => {
        const act = (what, data = {}) => postForm(`/canvas/comments/${encodeURIComponent(id)}/${what}`, data);
        if (e.target.closest("[data-send]")) { closePop(); if (await act("send")) say(host.L.sentToAgent); return; }
        if (e.target.closest("[data-resolve]")) { closePop(); if (await act("resolve")) await loadComments(); return; }
        if (e.target.closest("[data-reopen]")) { closePop(); if (await act("resolve", { undo: "1" })) await loadComments(); return; }
        if (e.target.closest("[data-del]")) { closePop(); if (await act("remove")) await loadComments(); return; }
        if (e.target.closest("[data-pop-ok]")) {
          const text = host.popEl.querySelector("[data-text]").value.trim(); if (!text) return;
          if (await act("reply", { text })) { await loadComments(); thread(b, id); }
        }
      }, null);
    };
    // the comments change elsewhere too (a colleague, the agent's reply): the core says so on comments:<session>
    root.querySelector(".dcv-clive")?.addEventListener("dh-live", () => loadComments());
    void loadComments();
    // the bar's buttons: every open one resolved, the kept ones sent to the agent, the resolved ones shown or not
    const clearAll = async () => {
      const n = Object.values(comments).filter((c) => !c.resolved).length;
      if (!n || !confirm((host.L.clearAsk || "").replace("{n}", n))) return;
      const r = await fetch(`/canvas/${tab}/comments/resolve`, { method: "POST", headers: { "x-csrf": csrf() } }).catch(() => null);
      if (!r?.ok) return say(host.L.notSaved || "!", "error");
      closePop(); await loadComments();
    };
    const sendAll = async () => {
      const sa = root.querySelector(".dcv-sendall"); if (sa) sa.disabled = true;
      const r = await fetch(`/canvas/${tab}/comments/send`, { method: "POST", headers: { "x-csrf": csrf() } }).catch(() => null);
      if (sa) sa.disabled = false;
      if (!r?.ok) return say(host.L.notSaved || "!", "error");
      const { sent } = await r.json(); say((host.L.sentAll || "").replace("{n}", sent)); await loadComments();
    };
    const toggleResolved = () => { showResolved = !showResolved; root.querySelector('[data-dcv="resolved"]')?.setAttribute("aria-pressed", String(showResolved)); for (const b of boards()) locate(b); };
    return { loadComments, countBadge, locate, placePins, compose, clearAll, sendAll, toggleResolved };
  };
})();
