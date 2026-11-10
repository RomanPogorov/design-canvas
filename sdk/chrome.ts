// The tab around the design canvas, as Speca's core draws it for a full-bleed versioned canvas (core/web/views/
// canvas.ts tabBody → `.tab-bare.versioned`): the version chip «Черновик · N правок» that opens the history drawer
// (the draft, the versions newest first: look, compare, restore, rename, delete; save as vN; undo; the journal), the
// prototype buttons, the banners of a version or a moment of the draft, and the comparison view — then the canvas
// itself, drawn by Speca's board.canvas.ts. The markup is Speca's, the addresses are the plugin's (BASE/c/:tab).
import { html, raw, join, type Raw } from "../speca/core/web/html.ts";
import { ic } from "../speca/core/web/ui/icons.ts";
import * as k from "../speca/core/web/ui/kit.ts";
import { rel, clock } from "../speca/core/web/fmt.ts";
import board from "../speca/plugins/design-canvas/board.canvas.ts";
import * as store from "./store.ts";
import { makeApi, type Who } from "./api.ts";
import { BASE, seam } from "./seam.ts";

type T = ReturnType<typeof makeApi>["t"];
export type BodyOpts = { version?: number; compare?: boolean; at?: number; readonly?: boolean; tz?: string };

/** What a version's name is (the person's, or the agent's when asked); "created" and "restored vN" are not names. */
const vName = (v: store.VersionRow) => (v.note && v.note !== "created" && !/^restored v\d+$/.test(v.note) ? v.note : "");
const focusOf = (ctx: Context, tabId: string) => ((ctx.state as any).designCanvas?.focus ?? {})[tabId] ?? null;

/** The tab body (Speca tabBody, bare + versioned). */
export async function tabBody(ctx: Context, who: Who, tab: store.TabRow, locale: "ru" | "en", opts: BodyOpts = {}): Promise<Raw> {
    const C = `${BASE}/c/${tab.id}`;
    const vs = await store.versions(ctx, tab.id);
    const cur = opts.version ? vs.find((v) => v.v === opts.version) ?? null : null;
    const draft = tab.draft_edits > 0;
    const edits = draft ? await store.draftEdits(ctx, tab.id) : [];
    const atEdit = !cur && opts.at ? edits.find((e) => e.n === opts.at) ?? null : null;
    const curBody = cur ? await store.stateAt(ctx, tab.id, { v: cur.v }) : null;
    const state = (curBody ?? atEdit?.body ?? tab.state) as Record<string, any>;
    const api = makeApi(ctx, who, { tabId: tab.id, version: cur?.v ?? null, at: atEdit?.n ?? null, locale, focus: cur || atEdit ? null : focusOf(ctx, tab.id) });
    const t = api.t;
    const readonly = !!opts.readonly;
    const tz = opts.tz ?? "UTC";
    const last = vs[vs.length - 1];
    const onDraft = !cur && draft;
    const shown = cur ?? last;
    let content: Raw = raw(seam(String(await board.render(state as any, null, api as any))));
    if (opts.compare) {
        // bodies only of the two compared (the list itself is read without them)
        const body = async (v: number) => (await store.stateAt(ctx, tab.id, { v })) ?? {};
        const prev = !onDraft && shown ? [...vs].reverse().find((v) => v.v < shown.v) : undefined;
        const pair = onDraft && last ? { a: await body(last.v), b: tab.state, from: `v${last.v}`, to: t("canvas.draft"), fromV: last.v, toV: null as number | null }
            : shown && prev ? { a: await body(prev.v), b: curBody && shown.v === cur?.v ? curBody : await body(shown.v), from: `v${prev.v}`, to: `v${shown.v}`, fromV: prev.v, toV: shown.v as number | null } : null;
        if (pair) content = raw(seam(String(await board.compare(pair.a as any, pair.b as any, api as any, { from: pair.from, to: pair.to, fromV: pair.fromV, toV: pair.toV }))));
    }
    const byLabel = (a: string) => (a === "agent" ? t("canvas.byAgent") : a === "auto" ? t("canvas.byAuto") : a === `user:${who.id}` ? t("canvas.byYou") : a.replace(/^user:/, ""));
    const noteOf = (n: string | null) => (!n ? null : n === "created" ? t("canvas.created") : /^restored v\d+$/.test(n) ? t("canvas.restoredFrom", { v: n.slice(10) }) : n);
    // the newest few in sight (and the one shown, wherever it is); the older ones wait behind "N more"
    const VD_SHOW = 5, newest = [...vs].reverse();
    const vdHidden = (v: store.VersionRow, i: number) => i >= VD_SHOW && !(!onDraft && shown && v.v === shown.v);
    const vdMore = newest.filter(vdHidden).length;
    const vdRow = (v: store.VersionRow, i: number) => {
        const on = !onDraft && shown && v.v === shown.v;
        const prev = vs.some((x) => x.v < v.v);
        return html`<li class="vd-i${on ? " on" : ""}" data-named="${!!vName(v)}"${vdHidden(v, i) ? raw(" hidden data-vd-old") : ""}><span class="vd-dot" aria-hidden="true"></span>
      <button type="button" class="vd-b" hx-get="${C}/body?v=${v.v}" hx-target="#cbody" hx-swap="innerHTML"><b>v${v.v}${vName(v) ? ` · ${vName(v)}` : ""}</b><small>${rel(v.created_at, t.locale)} · ${byLabel(v.author)}</small></button>
      <span class="vd-acts">${readonly ? "" : html`<button type="button" class="btn" data-variant="ghost" data-size="icon-sm" data-act="ver-rename" aria-label="${t("canvas.rename")}" data-tooltip="${t("canvas.rename")}" data-side="bottom">${ic("pencil", "ic-sm")}</button>`}${prev ? html`<button type="button" class="btn" data-variant="outline" data-size="sm" hx-get="${C}/body?v=${v.v}&compare=1" hx-target="#cbody" hx-swap="innerHTML">${t("canvas.compare")}</button>` : ""}${readonly ? "" : v.v !== last?.v ? html`<button type="button" class="btn" data-variant="outline" data-size="sm" hx-post="${C}/restore" hx-vals='${JSON.stringify({ v: v.v })}' hx-target="#cbody" hx-swap="innerHTML" data-tooltip="${t("canvas.restoreTip")}" data-side="left">${t("canvas.restore")}</button>`
        : draft ? html`<button type="button" class="btn" data-variant="outline" data-size="sm" hx-post="${C}/restore" hx-vals='${JSON.stringify({ v: v.v })}' hx-target="#cbody" hx-swap="innerHTML" hx-confirm="${t("canvas.dropAsk", { edits: t("canvas.edits", { n: tab.draft_edits }), v: v.v })}" data-tooltip="${t("canvas.dropTip", { v: v.v })}" data-side="left">${t("canvas.dropShort")}</button>` : ""}</span>${readonly ? "" : html`<form class="ver-name" hidden hx-post="${C}/versions/${v.v}/name" hx-swap="none"><input class="input" name="name" value="${vName(v)}" maxlength="200" placeholder="${t("canvas.versionNamePh")}" autocomplete="off" aria-label="${t("canvas.rename")}"></form>`}</li>`;
    };
    const lastEditor = edits.length ? byLabel(edits[edits.length - 1]!.author) : "";
    const kindTitle = t.locale === "ru" ? "Дизайн-холст" : "Design canvas";
    const drawer = shown ? html`<aside class="ver-drawer" id="verdrawer" hidden aria-label="${t("canvas.history")}">
      <header class="vd-h"><div class="vd-t"><b>${t("canvas.history")}</b><span>${[tab.title, kindTitle].filter(Boolean).join(" · ")}</span></div>${k.button({ icon: "x", variant: "ghost", size: "icon-sm", tooltip: t("common.close"), side: "left", attrs: html`data-act="ver-drawer"` })}</header>
      ${draft && !readonly ? html`<div class="vd-save">${k.button({ label: t("canvas.saveAs", { v: (last?.v ?? 0) + 1 }), icon: "check", size: "sm", attrs: html`hx-post="${C}/commit" hx-swap="none"` })}${k.button({ icon: "undo", variant: "ghost", size: "icon-sm", tooltip: t("canvas.undo"), side: "bottom", attrs: html`hx-post="${C}/undo" hx-swap="none"` })}</div>` : ""}
      <ol class="vd-list">
        ${draft ? html`<li class="vd-i draft${onDraft ? " on" : ""}"><span class="vd-dot" aria-hidden="true"></span>
          <button type="button" class="vd-b" hx-get="${C}/body" hx-target="#cbody" hx-swap="innerHTML"><b>${t("canvas.draft")} · ${t("canvas.edits", { n: tab.draft_edits })}</b><small>${[t("canvas.now"), lastEditor].filter(Boolean).join(" · ")}</small></button>
          <span class="vd-acts">${last ? html`<button type="button" class="btn" data-variant="outline" data-size="sm" hx-get="${C}/body?compare=1" hx-target="#cbody" hx-swap="innerHTML">${t("canvas.compare")}</button>` : ""}</span></li>` : ""}
        ${join(newest.map(vdRow))}
        ${vdMore ? html`<li class="vd-more"><button type="button" class="linkbtn" data-act="vd-more">${t("canvas.verMore", { n: vdMore })}</button></li>` : ""}
      </ol>
      <footer class="vd-f"><button type="button" class="linkbtn" data-dialog="${C}/journal">${ic("logs", "ic-sm")}${t("canvas.journalFull")}</button></footer>
    </aside>` : "";
    const verBar = shown ? html`<button type="button" class="vp-chip ${onDraft ? "draft" : ""}" data-act="ver-drawer" aria-expanded="false" aria-controls="verdrawer" data-tooltip="${t("canvas.history")}" data-side="bottom">${onDraft ? html`<i class="draft-dot"></i>${t("canvas.draft")}${tab.draft_edits ? html` · ${t("canvas.edits", { n: tab.draft_edits })}` : ""}` : html`v${shown.v}${vName(shown) ? html`<span class="vp-chip-name">· ${vName(shown)}</span>` : ""}`}${ic("chevDown", "ic-xs")}</button>` : "";
    const cmpBar = opts.compare ? html`<div class="ver-banner slim">${ic("merge", "ic-sm")}<span class="grow">${t("canvas.comparing")}</span><button class="btn" data-variant="ghost" data-size="sm" hx-get="${C}/body${cur ? `?v=${cur.v}` : ""}" hx-target="#cbody" hx-swap="innerHTML">${t("canvas.closeCompare")}</button></div>` : "";
    const verBanner = (v: store.VersionRow) => {
        const isLast = v.v === last?.v, ed = t("canvas.edits", { n: tab.draft_edits });
        const what = isLast ? html`<b>${t("canvas.verLast", { v: v.v })}</b> ${t("canvas.verLastDraft", { edits: ed })}` : html`<b>${t("canvas.verOld", { v: v.v })}</b> ${draft ? t("canvas.verNowDraft", { last: last!.v }) : t("canvas.verNow", { last: last!.v })}`;
        const back = html`<button class="btn" data-variant="ghost" data-size="sm" hx-get="${C}/body" hx-target="#cbody" hx-swap="innerHTML">${draft ? t("canvas.showDraft") : t("canvas.toCurrent")}</button>`;
        const act = readonly ? "" : isLast
            ? html`<button class="btn" data-size="sm" hx-post="${C}/restore" hx-vals='${JSON.stringify({ v: v.v })}' hx-target="#cbody" hx-swap="innerHTML" hx-confirm="${t("canvas.dropAsk", { edits: ed, v: v.v })}">${t("canvas.dropDraft", { v: v.v })}</button>`
            : html`<button class="btn" data-size="sm" hx-post="${C}/restore" hx-vals='${JSON.stringify({ v: v.v })}' hx-target="#cbody" hx-swap="innerHTML" data-tooltip="${t("canvas.restoreTip")}" data-side="bottom">${t("canvas.restoreV", { v: v.v })}</button>`;
        return html`<div class="ver-banner">${ic("clock", "ic-sm")}<span class="grow">${what}</span>${back}${act}</div>`;
    };
    const lastEdit = edits[edits.length - 1];
    const banner = atEdit ? html`<div class="ver-banner">${ic("clock", "ic-sm")}<span class="grow">${t("canvas.atEdit", { note: noteOf(atEdit.note) ?? `#${atEdit.n}`, time: clock(atEdit.created_at, tz) })}</span><button class="btn" data-variant="ghost" data-size="sm" hx-get="${C}/body" hx-target="#cbody" hx-swap="innerHTML">${t("canvas.toDraft")}</button>${readonly || atEdit.n === lastEdit?.n ? "" : html`<button class="btn" data-size="sm" hx-post="${C}/revert" hx-vals='${JSON.stringify({ n: atEdit.n })}' hx-swap="none">${t("canvas.revertHere")}</button>`}</div>`
        : cur && (cur.v !== last?.v || draft) ? verBanner(cur) : "";
    // a design and its prototype (Speca: an html tab built from it; here: a Hyper html canvas tab the agent built with
    // designCanvas.prototype): build / open / update; the agent builds, the buttons ask it as the person
    const live = !opts.compare && !cur && !atEdit;
    const pbtn = (o: { label: string; icon: string; post: string; tip?: string; behind?: boolean; back?: boolean }) => html`<button type="button" class="btn proto-btn${o.behind ? " behind" : ""}" data-variant="ghost" data-size="sm" hx-post="${o.post}" hx-swap="none" hx-disabled-elt="this"${o.back ? raw(` hx-vals='{"dir":"back"}'`) : ""}${o.tip ? raw(` data-tooltip="${o.tip.replace(/"/g, "&quot;")}" data-side="bottom"`) : ""}>${ic(o.icon, "ic-sm")}${o.behind ? html`<i class="proto-dot"></i>` : ""}${o.label}</button>`;
    const busy = (dir: string) => html`<span class="proto-busy"><i class="spin"></i>${t(`proto.busy.${dir}` as never)}</span>`;
    let protoBar: Raw | "" = "";
    if (live) {
        const built = tab.proto;
        const behind = !!built && built.designKey !== designKey(tab.state);
        const dir = tab.sync_dir;
        protoBar = dir
            ? html`<span class="proto-bar">${built ? pbtn({ label: t("proto.open"), icon: "play", post: `${C}/prototype/open`, tip: built.title }) : ""}${busy(dir === "build" ? "build" : dir)}</span>`
            : built
                ? html`<span class="proto-bar">${pbtn({ label: t("proto.open"), icon: "play", post: `${C}/prototype/open`, tip: built.title })}${behind && !readonly ? pbtn({ label: t("proto.update"), icon: "refresh", post: `${C}/prototype`, tip: t("proto.behind"), behind: true }) : ""}</span>`
                : readonly ? "" : html`<span class="proto-bar">${pbtn({ label: t("proto.build"), icon: "play", post: `${C}/prototype` })}</span>`;
    }
    return html`<div class="tab-bare versioned">${verBar || protoBar ? html`<div class="bare-ver">${verBar}${protoBar}</div>` : ""}${banner || cmpBar ? html`<div class="bare-banner">${banner}${cmpBar}</div>` : ""}${content}</div>${drawer}`;
}

/** What the prototype follows (Speca: CanvasDef.prototype.key — the artboards' files, not where they sit). */
export const designKey = (s: Record<string, any>) => Bun.hash(JSON.stringify(s?.files ?? {})).toString(36);

/** The journal dialog (Speca journalHtml): the draft's edits newest first (look, go back), the versions. */
export async function journalHtml(ctx: Context, who: Who, tab: store.TabRow, t: T, tz = "UTC"): Promise<Raw> {
    const C = `${BASE}/c/${tab.id}`;
    const vs = await store.versions(ctx, tab.id);
    const edits = await store.draftEdits(ctx, tab.id);
    const newest = vs[vs.length - 1];
    const del = (v: store.VersionRow) => !newest ? "" : html`${v.v !== newest.v ? html`<button type="button" class="btn" data-variant="ghost" data-size="icon-sm" hx-post="${C}/versions/${v.v}/delete" hx-swap="none" hx-confirm="${t("canvas.verDeleteAsk", { v: v.v })}" data-journal="${C}/journal" aria-label="${t("canvas.verDelete")}" data-tooltip="${t("canvas.verDelete")}" data-side="left">${ic("trash", "ic-sm")}</button>` : ""}${vs.length > (v.v === newest.v ? 1 : 2) ? html`<button type="button" class="btn" data-variant="ghost" data-size="icon-sm" hx-post="${C}/versions/${v.v}/delete" hx-vals='{"others":"1"}' hx-swap="none" data-journal="${C}/journal" hx-confirm="${v.v === newest.v ? t("canvas.verKeepAskCur", { v: v.v }) : t("canvas.verKeepAsk", { v: v.v, cur: newest.v })}" aria-label="${t("canvas.verKeepOnly")}" data-tooltip="${t("canvas.verKeepOnly")}" data-side="left">${ic("pin", "ic-sm")}</button>` : ""}`;
    const other = (a: string) => a !== "agent" && a !== `user:${who.id}`;
    const by = (a: string, at: Date | string) => (other(a) ? html`<small>${a.replace(/^user:/, "")} · ${clock(new Date(at), tz)}</small>` : "");
    const noteOf = (n: string | null) => (!n ? "—" : n === "created" ? t("canvas.created") : /^restored v\d+$/.test(n) ? t("canvas.restoredFrom", { v: n.slice(10) }) : n);
    const look = (q: string) => html`<button class="btn" data-variant="ghost" data-size="icon-sm" hx-get="${C}/body?${q}" hx-target="#cbody" hx-swap="innerHTML" data-act="close-dialog" aria-label="${t("canvas.look")}" data-tooltip="${t("canvas.look")}" data-side="left">${ic("eye", "ic-sm")}</button>`;
    const editRow = (e: store.EditRow, i: number) => html`<div class="jr-row"><span class="jr-note">${noteOf(e.note)}</span>${by(e.author, e.created_at)}<span class="jr-acts">${look(`at=${e.n}`)}${i === 0 ? "" : html`<button class="btn" data-variant="ghost" data-size="icon-sm" hx-post="${C}/revert" hx-vals='${JSON.stringify({ n: e.n })}' hx-swap="none" hx-confirm="${t("canvas.revertConfirm", { n: i })}" aria-label="${t("canvas.revertHere")}" data-tooltip="${t("canvas.revertHere")}" data-side="left">${ic("undo", "ic-sm")}</button>`}</span></div>`;
    const verRow = (v: store.VersionRow) => html`<div class="jr-row jr-ver"><b class="jr-v">v${v.v}</b><span class="jr-note">${v.note && v.note !== "created" ? noteOf(v.note) : v.v === 1 ? t("canvas.created") : v.changes?.length ? html`<span class="muted">${v.changes.map((c) => noteOf(c.note)).join(" · ")}</span>` : "—"}</span>${by(v.author, v.created_at)}<span class="jr-acts"><button type="button" class="btn" data-variant="ghost" data-size="icon-sm" data-act="ver-rename" aria-label="${t("canvas.rename")}" data-tooltip="${t("canvas.rename")}" data-side="left">${ic("pencil", "ic-sm")}</button>${del(v)}${look(`v=${v.v}`)}</span><form class="ver-name" hidden hx-post="${C}/versions/${v.v}/name" hx-swap="none" data-journal="${C}/journal"><input class="input" name="name" value="${vName(v)}" maxlength="200" placeholder="${t("canvas.versionNamePh")}" autocomplete="off" aria-label="${t("canvas.rename")}"></form></div>`;
    return html`<div class="dlg-form dlg-md jr-dlg"><header class="dlg-h"><div><h2>${ic("logs", "ic-sm")}${t("canvas.journalFull")}</h2><p>${tab.title}</p></div><button type="button" class="btn" data-variant="ghost" data-size="icon-sm" data-act="close-dialog" aria-label="${t("common.close")}">${ic("x")}</button></header>
    ${edits.length ? html`<form class="jr-save" hx-post="${C}/commit" hx-swap="none"><input class="input" name="name" placeholder="${t("canvas.versionNamePh")}" autocomplete="off"><button class="btn" data-size="sm">${t("canvas.saveAs", { v: tab.version + 1 })}</button></form>` : ""}
    <div class="jr-body">
      ${edits.length ? html`<div class="jr-sub"><i class="draft-dot"></i>${t("canvas.draft")}</div><div class="jr-list">${join([...edits].reverse().map(editRow))}</div>` : ""}
      <div class="jr-sub">${t("canvas.versions")}</div><div class="jr-list">${join([...vs].reverse().map(verRow))}</div></div></div>`;
}

/** #canvas-in: the region the live signal canvas:<tab> re-fetches (Speca: the session canvas, hx-swap outerHTML; its
 *  dcv.js keeps the running canvas and updates only what changed). */
export async function canvasIn(ctx: Context, who: Who, tab: store.TabRow, locale: "ru" | "en", opts: BodyOpts = {}): Promise<Raw> {
    return html`<div class="canvas-in" id="canvas-in" hx-get="${BASE}/c/${tab.id}/in" hx-trigger="dh-live" hx-swap="outerHTML" data-live-topic="${store.topics(tab.id).canvas}"><div class="cbody" id="cbody" role="tabpanel">${await tabBody(ctx, who, tab, locale, opts)}</div></div>`;
}

const ASSET_V = async () => Bun.hash((await Promise.all(["../speca/web/assets/css/product.css", "../speca/web/assets/css/app.css", "./host.js"].map((f) => Bun.file(new URL(f, import.meta.url)).text()))).join("\0")).toString(36);
/** The page the canvas tab frames (Speca's canvas panel, alone): Speca's styles and htmx, the host glue, the region. */
export async function page(ctx: Context, who: Who, tab: store.TabRow, locale: "ru" | "en", csrf: string, opts: BodyOpts = {}): Promise<string> {
    const v = await ASSET_V();
    const W = `${BASE}/web`;
    return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${Bun.escapeHTML(tab.title)}</title>
<link rel="stylesheet" href="${W}/vendor/basecoat.css?v=${v}"><link rel="stylesheet" href="${W}/css/app.css?v=${v}"><link rel="stylesheet" href="${W}/css/product.css?v=${v}">
<style>/* the frame is the canvas panel alone */html,body{height:100%;margin:0;overflow:hidden}body{background:var(--app);color:var(--foreground);font-family:var(--font-ui)}#canvas-in{height:100vh}#cbody{height:100%;position:relative}</style>
<script src="${W}/vendor/htmx.js?v=${v}"></script><script src="${W}/vendor/basecoat.js?v=${v}" defer></script><script src="${BASE}/host.js?v=${v}" defer></script>
</head><body hx-headers='${JSON.stringify({ "x-csrf": csrf }).replace(/'/g, "&#39;")}' data-user="${Bun.escapeHTML(who.id)}" data-tab="${tab.id}">
${await canvasIn(ctx, who, tab, locale, opts)}
<dialog class="dialog dh-dialog" id="dlg" aria-modal="true"><div id="dlg-body"></div></dialog><div id="toaster" class="toaster"></div>
</body></html>`;
}
