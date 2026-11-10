import { defineCanvas, html, join, ic, sandboxAttrs, mergeState, type Raw } from "speca/sdk";
import { stateSchema, version, sheetOf, sheetsOf, type DesignState } from "./lib/model.ts";
import { renderKey, render } from "./lib/template.ts";
import { boardHtml } from "./lib/export.ts";
import { L, C } from "./lib/strings.ts";
import { diffBoard, type Change } from "./lib/diff.ts";

// The design canvas: artboards (one sandboxed iframe each, 1:1) in one world moved by a camera; the host draws the
// selection, the properties panel, menus, comments and the preview over it. State: the index (boards, order, row
// titles, notes, comments) and one HTML file per artboard. The host's UI is made of the canvas kit (assets/dck.*).
// The assets are named by their content's hash: a page that keeps running gets the new scripts on its next render.
// the host's parts (assets/dcv-*.js), loaded after the panel and before dcv.js, which takes them
const PARTS = ["dcv-write.js", "dcv-play.js", "dcv-menus.js", "dcv-comments.js", "dcv-presence.js", "dcv-clip.js"];
const ASSETS = ["dck.css", "dcv.css", "dck.js", "panel.js", ...PARTS, "dcv.js", "dcc.js"];
let assetsKey = { at: 0, v: "" };
async function assetsVersion(): Promise<string> {
  if (Date.now() - assetsKey.at < 2000) return assetsKey.v;
  const texts = await Promise.all(ASSETS.map((f) => Bun.file(new URL(`./assets/${f}`, import.meta.url)).text()));
  assetsKey = { at: Date.now(), v: Bun.hash(texts.join("\0")).toString(36) };
  return assetsKey.v;
}
export default defineCanvas({
  title: { en: "Design canvas", ru: "Дизайн-холст" },
  icon: "penTool",
  description: "Screens and their states as artboards on an infinite canvas. Use the design-canvas tools to create and edit it (not canvas_write).",
  state: stateSchema,
  versioned: true,
  // one artboard drawn or edited = one undo step (a whole answer can draw a dozen of them)
  undo: "each",
  bare: true,
  // its prototype follows the artboards themselves (files), not stickies, comments or where boards sit
  prototype: { key: (s) => s.files, ask: (o) => o.dir === "back"
    ? `The person pressed "Bring into design": the prototype ${o.prototype} changed since it was last in step with the design canvas ${o.design}. See exactly what changed with canvas_read {tabId: "${o.prototype}", sinceSync: true}; apply what of it is design (screens, copy, styles, new states or screens) to the design's artboards with design-canvas_read / design-canvas_edit (or design-canvas_write for a new screen); leave out what is only prototype logic. Then canvas_synced {tabId: "${o.prototype}"}. Do not change the prototype.`
    : o.dir === "update"
    ? `The person pressed "Update prototype" on the design canvas ${o.design}: update the html tab ${o.prototype} (built from it) to match the design. See what changed in the design with canvas_read {tabId: "${o.design}", sinceSync: true}; bring that over with canvas_edit (or canvas_write) with synced: true${o.ahead ? " — the prototype was changed too since the last sync: keep its own changes, apply only what changed in the design" : ""}. Do not change the design canvas.`
    : `The person pressed "Build prototype" on the design canvas ${o.design}: build the prototype as a NEW html canvas tab with canvas_open {kind: "html", from: "${o.design}", …} — one self-contained page with every screen, working navigation and controls. Not links on the design canvas (its Preview already does that), and do not change the design canvas. Build it in steps the person watches, not in one huge call: within the first minute canvas_open the shell (the app frame, the shared styles, the navigation, the first screen; every other screen a placeholder that names it), then fill the screens one per canvas_edit, in the flow's order (design-canvas_read each artboard when you get to it), then wire the controls and try the main flow with canvas_screenshot clicks.` },
  // every artboard is a card of the design library; it draws the components it uses, so its preview changes with them
  library: {
    cards: (s: DesignState, tabId) => {
      const deps = Object.entries(s.files).filter(([f]) => !s.boards[f]).map(([f, v]) => f + v).join("\0");
      return s.order.flatMap((f) => {
        const b = s.boards[f];
        if (!b || b.pending || s.files[f] === undefined) return [];
        return [{ file: f, kind: "artboard" as const, title: b.title || f, w: b.w, h: b.h, html: s.files[f]!, deps, shot: `/p/design-canvas/board/${tabId}/${encodeURIComponent(f)}?v=shot` }];
      });
    },
    count: { array: "order" },
  },
  // a screenshot of the whole canvas waits until every drawn artboard is live
  // its artboards as standalone pages, for a canvas that takes them in (a paste into a design editor)
  pages: (s, parts) => [...new Set(parts ?? s.order)].flatMap((f) => {
    const b = s.boards[f];
    if (!b || b.pending || s.files[f] === undefined) return [];
    return [{ part: f, title: b.title || f, w: b.w, h: b.h, x: b.x, y: b.y, html: boardHtml(s, f) }];
  }),
  shotReady: `[...document.querySelectorAll(".dcv-board:not(.pending)")].every((x) => x.classList.contains("live"))`,
  // a part a screenshot can show alone: an artboard at full size ("Main.html") or one element of it ("Main.html#12")
  shot: (s: DesignState, part: string, api) => {
    const m = /^([A-Za-z0-9_][A-Za-z0-9_.-]*\.html)(?:#(\d+)(?::[\d/]*)?)?$/.exec(part.trim());
    const b = m ? s.boards[m[1]!] : undefined;
    if (!m || !b || b.pending || s.files[m[1]!] === undefined) return null;
    return { path: `/p/design-canvas/board/${api.tabId}/${encodeURIComponent(m[1]!)}?v=shot${api.version ? `&ver=${api.version}` : ""}`, width: b.w, height: b.h, ...(m[2] ? { clip: `[data-tid="${m[2]}"]` } : {}) };
  },
  // a branch merged back, by artboard: one changed on one side only takes that side; changed on both, the chat's stays
  // and the branch's is put beside it as an artboard of its own ("Title (branch)"); layout, notes, pages key by key
  merge: (base, ours, theirs, o) => {
    const { files: bf, ...b } = base, { files: of, ...ou } = ours, { files: tf, ...th } = theirs;
    const r = mergeState(b, ou, th) as { state: Omit<DesignState, "files">; conflicts: number };
    const st = { ...r.state, files: { ...of } } as DesignState;
    let conflicts = r.conflicts;
    for (const f of new Set([...Object.keys(of), ...Object.keys(tf)])) {
      const B = bf[f], O = of[f], T = tf[f];
      if (T === undefined) { if (B !== undefined && O === B) delete st.files[f]; continue; }   // dropped in the branch
      if (O === undefined) { if (B === undefined || T !== B) st.files[f] = T; continue; }      // new there, or changed there
      if (T === O || T === B) continue;
      if (O === B) { st.files[f] = T; continue; }
      let name = f.replace(/\.html$/, "-branch.html");
      for (let i = 2; st.files[name] !== undefined || st.boards[name]; i++) name = f.replace(/\.html$/, `-branch-${i}.html`);
      st.files[name] = T;
      const bd = theirs.boards[f] ?? ours.boards[f];
      if (bd) {
        st.boards[name] = { ...bd, x: bd.x + bd.w + 80, title: `${bd.title} (${o.label})`.slice(0, 120) };
        const at = st.order.indexOf(f);
        st.order = at < 0 ? [...st.order, name] : [...st.order.slice(0, at + 1), name, ...st.order.slice(at + 1)];
      }
      conflicts++;
    }
    st.order = st.order.filter((f, i, a) => st.boards[f] && a.indexOf(f) === i);
    return { state: st, conflicts };
  },
  // two states of the canvas, as a designer compares them: per artboard that changed, came or went — what exactly
  // changed (texts, styles, pictures, elements added and removed; lib/diff.ts) and both pictures, side by side or as a
  // swipe; a filter by kind (assets/dcc.js)
  compare: async (a: DesignState, b: DesignState, api, o) => {
    const l = L[api.t.locale === "ru" ? "ru" : "en"];
    const av = await assetsVersion();
    const files = [...b.order.filter((f) => b.boards[f]), ...a.order.filter((f) => a.boards[f] && !b.boards[f])];
    const kind = (f: string) => !a.boards[f] ? "added" : !b.boards[f] ? "removed"
      : a.files[f] !== b.files[f] || a.boards[f]!.w !== b.boards[f]!.w || a.boards[f]!.h !== b.boards[f]!.h || a.boards[f]!.title !== b.boards[f]!.title ? "changed" : "same";
    const rows = files.map((f) => ({ f, k: kind(f) })).filter((r) => r.k !== "same");
    const same = files.length - rows.length;
    const count = (k: string) => rows.filter((r) => r.k === k).length;
    const q = (s: string) => `«${s}»`;
    const changeLine = (c: Change) => {
      const lab = (t: string) => html`<span class="dcc-ck">${t}</span>`;
      switch (c.kind) {
        case "text": return html`<li>${lab(l.cmpText)}<s>${q(c.before)}</s><span class="dcc-arrow">→</span><b>${q(c.after)}</b></li>`;
        case "style": return html`<li>${lab(l.cmpStyle)}${join(c.props.map((p) => html`<code>${p.prop}</code> ${p.before ? html`<s>${p.before}</s>` : "—"}<span class="dcc-arrow">→</span>${p.after ? html`<b>${p.after}</b>` : "—"}`), "; ")}</li>`;
        case "class": return html`<li>${lab(l.cmpClass)}<s>${c.before || "—"}</s><span class="dcc-arrow">→</span><b>${c.after || "—"}</b></li>`;
        case "image": return html`<li>${lab(l.cmpImage)}</li>`;
        case "link": return html`<li>${lab(l.cmpLink)}<s>${c.before || "—"}</s><span class="dcc-arrow">→</span><b>${c.after || "—"}</b></li>`;
        case "css": return html`<li>${lab(l.cmpCss)}</li>`;
        case "added": return html`<li class="add">${lab(l.cmpNew)}<b>${c.text ? q(c.text) : `<${c.tag}>`}</b></li>`;
        case "removed": return html`<li class="del">${lab(l.cmpGone)}<s>${c.text ? q(c.text) : `<${c.tag}>`}</s></li>`;
      }
    };
    const frame = (f: string, v: number | null, st: DesignState, cls = "") => {
      const bd = st.boards[f]!;
      return html`<iframe class="${cls}" sandbox loading="lazy" src="/p/design-canvas/snapshot/${api.tabId}/${encodeURIComponent(f)}${v != null ? `?ver=${v}` : ""}" width="${bd.w}" height="${bd.h}" title="${bd.title}"></iframe>`;
    };
    const side = (label: string, f: string, v: number | null, st: DesignState, present: boolean) =>
      html`<div class="dcc-side"><div class="dcc-cap">${label}</div>${present ? html`<div class="dcc-scroll"><div class="dcc-frame">${frame(f, v, st)}</div></div>` : html`<div class="dcc-none">${l.cmpNone}</div>`}</div>`;
    const row = (r: { f: string; k: string }) => {
      const ba = a.boards[r.f], bb = b.boards[r.f], title = (bb ?? ba)!.title;
      // compared as drawn: a template's data (texts, colours) shows in what changed
      const drawn = (st: DesignState) => render(st.files[r.f] ?? "", st.files, undefined, { tids: false, depth: 0, seen: new Set() });
      const changes: Change[] = r.k === "changed" ? diffBoard(drawn(a), drawn(b)) : [];
      const lines: Raw[] = [];
      if (r.k === "added") lines.push(html`<li class="add">${l.cmpNewBoard}</li>`);
      if (r.k === "removed") lines.push(html`<li class="del">${l.cmpGoneBoard}</li>`);
      if (ba && bb && ba.title !== bb.title) lines.push(html`<li><span class="dcc-ck">${l.cmpTitle}</span><s>${q(ba.title)}</s><span class="dcc-arrow">→</span><b>${q(bb.title)}</b></li>`);
      if (ba && bb && (ba.w !== bb.w || ba.h !== bb.h)) lines.push(html`<li><span class="dcc-ck">${l.cmpSize}</span><s>${ba.w}×${ba.h}</s><span class="dcc-arrow">→</span><b>${bb.w}×${bb.h}</b></li>`);
      lines.push(...changes.map(changeLine));
      if (r.k === "changed" && !lines.length) lines.push(html`<li>${l.cmpLooks}</li>`);
      const SHOW = 8, more = lines.length - SHOW;
      const both = r.k === "changed" && a.files[r.f] !== undefined && b.files[r.f] !== undefined;
      return html`<section class="dcc-row" data-kind="${r.k}">
        <div class="dcc-t"><b>${title}</b><span class="pill p3 dcc-${r.k}">${l[`cmp_${r.k}` as "cmp_changed"]}</span></div>
        <ul class="dcc-ch">${join(lines.slice(0, SHOW))}${more > 0 ? html`<li class="dcc-more"><details><summary>${l.cmpMore.replace("{n}", String(more))}</summary><ul class="dcc-ch">${join(lines.slice(SHOW))}</ul></details></li>` : ""}</ul>
        <div class="dcc-pair">${side(o.from, r.f, o.fromV, a, !!ba && a.files[r.f] !== undefined)}${side(o.to, r.f, o.toV, b, !!bb && b.files[r.f] !== undefined)}</div>
        ${both ? html`<div class="dcc-swipe" style="--x:50%"><div class="dcc-caps"><span>${o.from}</span><span>${o.to}</span></div><div class="dcc-scroll"><div class="dcc-frame">${frame(r.f, o.fromV, a, "under")}${frame(r.f, o.toV, b, "over")}<i class="dcc-line"></i></div></div><input type="range" min="0" max="100" value="50" aria-label="${l.cmpDrag}"></div>` : ""}
      </section>`;
    };
    const seg = (key: string, items: Array<[string, string]>, on: string) => html`<div class="seg" role="group">${join(items.map(([v, label]) => html`<button type="button" data-dcc-set="${key}:${v}" aria-pressed="${v === on}">${label}</button>`))}</div>`;
    const filters: Array<[string, string]> = [["all", `${l.cmpAll} ${rows.length}`], ...(["changed", "added", "removed"] as const).filter((k) => count(k)).map((k): [string, string] => [k, `${l[k === "changed" ? "cmpChanged" : k === "added" ? "cmpAdded" : "cmpRemoved"]} ${count(k)}`])];
    return html`<div class="dcc dk-scope" data-mode="side" data-filter="all">
      <header class="dcc-h"><div class="dcc-ht"><b>${o.from} → ${o.to}</b><span>${l.cmpSummary.replace("{c}", String(count("changed"))).replace("{a}", String(count("added"))).replace("{r}", String(count("removed"))).replace("{s}", String(same))}</span></div>
        ${rows.length ? html`<div class="dcc-ctl">${filters.length > 2 ? seg("filter", filters, "all") : ""}${count("changed") ? seg("mode", [["side", l.cmpSide], ["swipe", l.cmpSwipe]], "side") : ""}</div>` : ""}</header>
      ${rows.length ? join(rows.map(row)) : html`<div class="dcc-empty">${l.cmpSame}</div>`}
      <link rel="stylesheet" href="/p/design-canvas/assets/dck.css"><link rel="stylesheet" href="/p/design-canvas/assets/dcv.css?v=${av}"><script src="/p/design-canvas/assets/dcc.js?v=${av}"></script></div>`;
  },
  render: async (s: DesignState, _d, api) => {
    const lang = api.t.locale === "ru" ? "ru" : "en", l = L[lang];
    if (!api.tabId) return html`<div class="empty-line">—</div>`;
    const sid = (await api.canvas.view(api.tabId))?.sessionId ?? "", av = await assetsVersion();
    // a saved version or a moment of the journal: the frames show that state, not the draft
    const moment = api.version != null ? `&ver=${api.version}` : api.at != null ? `&at=${api.at}` : "";
    // planned artboards wait in their frames, in order: the first one is the one being drawn while the agent works
    const waiting = s.order.filter((f) => s.boards[f]?.pending), drawn = s.order.filter((f) => s.boards[f] && !s.boards[f]!.pending).length;
    const boards = s.order.filter((f) => s.boards[f]).map((f) => {
      const b = s.boards[f]!, v = version(s.files[f] ?? ""), k = renderKey(f, s.files);
      if (b.pending) return html`<div class="dcv-board pending${f === waiting[0] ? " next" : ""}" data-file="${f}" data-sheet="${sheetOf(s, b)}" data-title="${b.title}" data-v="" data-k="pending" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px">
        <div class="dcv-name"><span>${b.title}</span></div>
        <div class="dcv-wait"><span class="dcv-wait-now"><i class="spin"></i>${l.drawing}</span><span class="dcv-wait-later">${f === waiting[0] ? l.notDrawn : l.queued}</span></div>
        <div class="dcv-rings"></div></div>`;
      return html`<div class="dcv-board" data-file="${f}" data-sheet="${sheetOf(s, b)}" data-title="${b.title}" data-v="${v}" data-k="${k}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px">
        <div class="dcv-name"><span>${b.title}</span></div>
        <iframe ${sandboxAttrs()} data-src="/p/design-canvas/board/${api.tabId}/${encodeURIComponent(f)}?v=${k}${moment}" title="${b.title}" width="${b.w}" height="${b.h}"></iframe>
        <div class="dcv-ph${moment ? "" : " pic"}" aria-hidden="true">${moment ? "" : html`<img class="dcv-thumb" loading="lazy" decoding="async" data-base="/design/thumb/${api.tabId}?q=1&f=${encodeURIComponent(f)}" src="/design/thumb/${api.tabId}?q=1&f=${encodeURIComponent(f)}&k=${k}" alt="" loading="lazy" decoding="async" draggable="false">`}</div><div class="dcv-rings"></div><i class="dcv-rz" data-rz="e"></i><i class="dcv-rz" data-rz="s"></i><i class="dcv-rz" data-rz="se"></i></div>`;
    });
    const notes = Object.entries(s.notes ?? {}).map(([id, n]) => html`<div class="dcv-note ${n.kind}" data-note="${id}" data-sheet="${sheetOf(s, n)}" style="left:${n.x}px;top:${n.y}px;${n.w && n.kind !== "title" ? `width:${n.w}px` : ""}">${n.text}</div>`);
    const tool = (a: string, label: string, icon: string) => html`<button type="button" class="dk-ib" data-dcv="${a}" aria-label="${label}" data-tooltip="${label}" data-side="top">${ic(icon, "ic-sm")}</button>`;
    const strings = { ...C[lang], copied: l.copied, stale: l.stale, notSaved: l.notSaved, ask: l.ask, workDraw: l.workDraw, workNew: l.workNew, workApply: l.workApply, workTip: l.workTip, workChars: l.workChars };
    // the artboard the agent pointed the person at (canvas_show focus): by its file, else by its title
    const want = String(api.focus?.target ?? "").trim().toLowerCase();
    const focusFile = !want ? "" : s.order.find((f) => f.toLowerCase() === want || f.toLowerCase() === `${want}.html`)
      ?? s.order.find((f) => (s.boards[f]?.title ?? "").toLowerCase() === want)
      ?? s.order.find((f) => (s.boards[f]?.title ?? "").toLowerCase().includes(want) || want.includes((s.boards[f]?.title ?? "\u0000").toLowerCase())) ?? "";
    return html`<div class="dcv dk-scope" data-js="${av}" data-tab="${api.tabId}" data-focus="${focusFile}" data-focus-at="${focusFile ? String(api.focus?.at ?? "") : ""}" data-follow="${focusFile && api.focus?.follow ? "1" : ""}" data-me="${api.user.id}" data-ro="${api.version != null || api.at != null ? "1" : ""}" data-l="${JSON.stringify(strings)}" data-sheets="${JSON.stringify(sheetsOf(s))}">
      <i hidden class="dcv-live" data-live-topic="${sid ? `presence:${sid}` : ""}"></i><i hidden class="dcv-clive" data-live-topic="${sid ? `comments:${sid}` : ""}"></i>
      <div class="dcv-stage" tabindex="0">
        <div class="dcv-world">${join(notes)}${join(boards)}<div class="dcv-guides"></div><div class="dcv-cursors"></div></div>
        ${!boards.length ? html`<div class="dcv-empty">${ic("penTool")}<span>${l.empty}</span></div>` : ""}
        <div class="dcv-marq" hidden></div>
        <div class="dcv-selbar dk-bar" hidden></div>
        <div class="dcv-zoom dk-bar"><span class="dcv-peers"></span><span class="dcv-prog">${waiting.length ? html`<span class="dk-txt dcv-progress"><i class="spin"></i>${l.progress.replace("{n}", String(drawn)).replace("{m}", String(drawn + waiting.length))}</span><span class="dk-vsep"></span>` : ""}</span>
          <button type="button" class="dk-ib" data-dcv="out" aria-label="${l.zoomOut}" data-tooltip="${l.zoomOut}" data-side="top">−</button>
          <button type="button" class="dcv-pct" data-dcv="100">100%</button>
          <button type="button" class="dk-ib" data-dcv="in" aria-label="${l.zoomIn}" data-tooltip="${l.zoomIn}" data-side="top">+</button>
          ${tool("fit", `${l.fit} · ⇧1`, "layout")}
          <span class="dk-vsep"></span>
          <button type="button" class="dk-ib dcv-sbtn" data-dcv="sheets" aria-label="${C[lang].sheets}" data-tooltip="${C[lang].sheets}" data-side="top">${ic("pages", "ic-sm")}<span class="dcv-sname"></span></button>
          <button type="button" class="dk-ib dcv-cbtn" data-dcv="comments" aria-pressed="false" aria-label="${l.comments}" data-tooltip="${l.comments} · C" data-side="top">${ic("msg", "ic-sm")}<span class="dk-badge dcv-cbadge" hidden></span></button>
          <button type="button" class="dk-btn dk-primary dcv-sendall" data-dcv="send-all" hidden>${ic("send", "ic-sm")}<span></span></button>
          <button type="button" class="dk-ib dcv-rbtn" data-dcv="resolved" aria-pressed="false" aria-label="${C[lang].showResolved}" data-tooltip="${C[lang].showResolved}" data-side="top" hidden>${ic("check", "ic-sm")}</button>
          <button type="button" class="dk-ib dcv-clear" data-dcv="clear-comments" aria-label="${C[lang].clearAll}" data-tooltip="${C[lang].clearAll}" data-side="top" hidden>${ic("trash", "ic-sm")}</button>
          <button type="button" class="dk-ib" data-dcv="panel" aria-pressed="false" aria-label="${l.panel}" data-tooltip="${l.panel}" data-side="top">${ic("sliders", "ic-sm")}</button>
          <span class="dcv-help" data-tooltip="${l.hint}" data-side="top">?</span></div>
      </div>
      <aside class="dcv-panel" hidden></aside>
      <div class="dcv-menu dk-menu" role="menu" hidden></div>
      <div class="dcv-play" hidden><div class="dcv-play-h"><span class="dcv-play-t"></span><span class="grow"></span>
        ${tool("play-prev", C[lang].play_prev, "chevLeft")}${tool("play-next", C[lang].play_next, "chevRight")}${tool("play-close", l.close, "x")}</div>
        <div class="dcv-play-stage"></div></div>
    </div>
    <link rel="stylesheet" href="/p/design-canvas/assets/dck.css?v=${av}"><link rel="stylesheet" href="/p/design-canvas/assets/dcv.css?v=${av}"><script src="/p/design-canvas/assets/dck.js?v=${av}"></script><script src="/p/design-canvas/assets/panel.js?v=${av}"></script>${PARTS.map((f) => html`<script src="/p/design-canvas/assets/${f}?v=${av}"></script>`)}<script src="/p/design-canvas/assets/dcv.js?v=${av}"></script>`;
  },
});
