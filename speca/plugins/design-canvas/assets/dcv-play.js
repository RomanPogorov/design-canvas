// The design canvas's preview: one artboard at a time in its own frame, links between artboards navigate.
(() => {
  const V = (document.currentScript && new URL(document.currentScript.src, location.href).searchParams.get("v")) || "";
  ((window.__dcvParts ||= {})[V] ||= {}).play = (host) => {
    // ── preview: one artboard at a time, links between artboards navigate ──
    const playEl = host.playEl, playStage = playEl.querySelector(".dcv-play-stage"), { boards } = host, { esc } = window.dck;
    let playFrame = null, playFile = null;
    function openPlay(file) {
      const b = boards().find((x) => x.dataset.file === file); if (!b) return;
      playFile = file; playEl.hidden = false;
      playEl.querySelector(".dcv-play-t").textContent = b.dataset.title;
      const w = b.offsetWidth, h = b.offsetHeight, src = new URL(b.querySelector("iframe").dataset.src, location.href);
      src.searchParams.set("play", "1");
      // the same sandbox as the artboard's frame (core/web/sandbox.ts)
      const sb = b.querySelector("iframe");
      playStage.innerHTML = `<iframe sandbox="${esc(sb.getAttribute("sandbox"))}" allow="${esc(sb.getAttribute("allow") || "")}" referrerpolicy="no-referrer" width="${w}" height="${h}" title="${esc(b.dataset.title)}"></iframe>`;
      playFrame = playStage.querySelector("iframe"); playFrame.src = src.pathname + src.search;
      const k = Math.min(1, (playStage.clientWidth - 48) / w, (playStage.clientHeight - 48) / h);
      playFrame.style.transform = `scale(${k})`; playFrame.style.margin = `${-(h - h * k) / 2}px ${-(w - w * k) / 2}px`;
    }
    const playStep = (d) => { const list = boards().filter((b) => !b.classList.contains("pending")).map((b) => b.dataset.file), i = list.indexOf(playFile); const next = list[i + d]; if (next) openPlay(next); };
    function closePlay() { playEl.hidden = true; playStage.innerHTML = ""; playFrame = null; playFile = null; }
    return { openPlay, closePlay, playStep, get playFrame() { return playFrame; } };
  };
})();
