// The HTTP side: Speca's plugin routes (../speca/plugins/design-canvas/*.route.ts) run as they are, given the api
// Speca's core would give them; and the core's canvas endpoints the client calls (/canvas/:tab/… in Speca, BASE/c/:tab/…
// here — see seam.ts), implemented after Speca's core/web/routes/app-canvas.ts over the plugin's store.
import { isRaw } from "../speca/core/web/html.ts";
import { makeT } from "../speca/core/i18n/i18n.ts";
import { makeApi, localeOf, showTab, KIND, type Who } from "./api.ts";
import * as store from "./store.ts";
import { tabBody, canvasIn, journalHtml, designKey, page } from "./chrome.ts";
import { seam, BASE } from "./seam.ts";
import { thumb } from "./thumbs.ts";

type Opts = { req: Request; params: Record<string, string> };

/** The signed-in person (Hyper's session.user; on an instance without sign-in, its owner). */
export async function personOf(ctx: Context, session: Session | null, req: Request): Promise<Who> {
    let u: any = session?.user;
    if (!u) { try { u = await ctx.fns.auth.currentUser({ req }); } catch { u = null; } }
    return { kind: "user", id: String(u?.id ?? "owner"), name: String(u?.name ?? "") || "Owner" };
}
/** CSRF (Speca: the x-csrf header htmx and dcv.js send from <body hx-headers>); an instance without sessions has none. */
export async function csrfOk(ctx: Context, req: Request): Promise<boolean> {
    let expected = "";
    try { expected = String(await ctx.fns.auth.csrfToken({ req }) ?? ""); } catch { expected = ""; }
    if (!expected) return true;
    return ctx.fns.auth.verifyCsrf({ req, token: req.headers.get("x-csrf") ?? req.headers.get("x-csrf-token") ?? "" });
}
const toResponse = (r: unknown): Response => r instanceof Response ? r : new Response(isRaw(r) ? (r as any).html : String(r ?? ""), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
const htmlRes = (s: unknown, headers: Record<string, string> = {}) => new Response(isRaw(s) ? (s as any).html : String(s ?? ""), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...headers } });
// a header carries ASCII only: the toast's text as JSON \u escapes (htmx parses them back)
const hxToast = (title: string, category = "success") => ({ "hx-trigger": JSON.stringify({ "dh-toast": { title, category } }).replace(/[\u0080-\uffff]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`) });
const toast = (title: string, category = "success") => new Response(null, { status: 204, headers: hxToast(title, category) });
const formOf = async (req: Request): Promise<Record<string, string>> => {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("json")) return (await req.json().catch(() => ({}))) as Record<string, string>;
    const f = await req.formData().catch(() => null);
    return f ? Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v)])) : {};
};

/** One of Speca's plugin routes, as Speca's core runs it: (req, params, api) → Response | html. */
export async function specaRoute(ctx: Context, session: Session | null, o: Opts, def: { method: string; handler: (req: Request, params: Record<string, string>, api: any) => Promise<unknown> }): Promise<Response> {
    if (def.method === "POST" && !(await csrfOk(ctx, o.req))) return new Response("forbidden", { status: 403 });
    const who = await personOf(ctx, session, o.req);
    const api = makeApi(ctx, who, { tabId: o.params.tab ?? null, locale: await localeOf(ctx, o.req) });
    const res = toResponse(await def.handler(o.req, o.params, api));
    // the person changed the canvas: the agent hears it when it reads the canvas next (Speca: a quiet note to it)
    if (def.method === "POST" && res.ok && o.params.tab && /\/(edit|layout)\//.test(new URL(o.req.url).pathname)) note(ctx, o.params.tab, "The person edited the canvas by hand; re-read the artboards you change.");
    const type = res.headers.get("content-type") ?? "";
    if (type.startsWith("text/html")) { const h = new Headers(res.headers); return new Response(seam(await res.text()), { status: res.status, headers: h }); }
    return res;
}

/** Quiet notes for the agent about what the person did (Speca enqueues them as steer messages that do not wake it);
 *  designCanvas.read and designCanvas.comments hand them over once. */
export function note(ctx: Context, tabId: string, text: string) {
    const n: Record<string, string[]> = ((ctx.state as any).designCanvas ??= {}).notes ??= {};
    const list = (n[tabId] ??= []);
    if (list[list.length - 1] !== text) list.push(text);
    if (list.length > 20) list.shift();
}
export function takeNotes(ctx: Context, tabId: string): string[] {
    const n: Record<string, string[]> = ((ctx.state as any).designCanvas ??= {}).notes ??= {};
    const list = n[tabId] ?? [];
    delete n[tabId];
    return list;
}

/** A message from the person to the agent of the design's chat, through Hyper's own chat pipeline (agent.acceptMessage). */
export async function sendToAgent(ctx: Context, tab: store.TabRow, text: string): Promise<boolean> {
    if (!tab.agent_id) return false;
    const req = new Request(`http://localhost/agent/${encodeURIComponent(tab.agent_id)}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ text }) });
    try { const r: Response = await ctx.fns.agent.acceptMessage({ req, params: { id: tab.agent_id } }); return r.ok; } catch { return false; }
}

const cmJson = (cm: store.CommentRow, me: string) => ({ id: cm.id, author: cm.author, name: cm.author_name, relay: false, mine: cm.author === `user:${me}`, anchor: cm.anchor, label: cm.label, body: cm.body, replies: (cm.replies ?? []).map((r) => ({ ...r, mine: r.author === `user:${me}` })), sent: !!cm.sent_at, resolved: !!cm.resolved_at, at: new Date(cm.created_at).toISOString() });
/** Speca pinnedTo, as text: the element a comment is pinned to, for the agent. */
const pinned = (c: store.CommentRow, tab: store.TabRow) => `[${store.whereOf(c)}](${c.anchor.path}) on design canvas «${tab.title}» (${tab.id})`;
async function sendComments(ctx: Context, tab: store.TabRow, cs: store.CommentRow[], who: Who, t: ReturnType<typeof makeT>): Promise<number> {
    if (!cs.length) return 0;
    const text = cs.length === 1
        ? `${cs[0]!.body}\n\n— ${t.locale === "ru" ? "комментарий к" : "comment on"} ${pinned(cs[0]!, tab)} (comment ${cs[0]!.id}; designCanvas.read({ tabId: "${tab.id}", file }) shows the element, designCanvas.resolveComment when done)`
        : `${t("cm.batchIntro", { n: cs.length, title: tab.title })}\n\n${cs.map((c, i) => `${i + 1}. ${pinned(c, tab)}: ${c.body} (comment ${c.id})`).join("\n")}\n\n(designCanvas.comments({ tabId: "${tab.id}" }) lists them; designCanvas.resolveComment when done)`;
    if (!(await sendToAgent(ctx, tab, text))) return -1;
    await store.markSent(ctx, tab.id, cs.map((c) => c.id), `user:${who.id}`);
    return cs.length;
}

const PROTO_ASK = (o: { dir: "build" | "update"; design: store.TabRow }) => o.dir === "update"
    ? `The person pressed "Update prototype" on the design canvas ${o.design.id}: the design changed since the prototype was built. Read the design (designCanvas.read({ tabId: "${o.design.id}" }) and its artboards) and bring what changed over into the prototype with designCanvas.prototype({ tabId: "${o.design.id}", html }) — the whole page again, keeping the prototype's own logic. Do not change the design canvas.`
    : `The person pressed "Build prototype" on the design canvas ${o.design.id}: build a clickable prototype as ONE self-contained html page with every screen of the design (same look, same copy), working navigation and controls (screens switch in place; forms, tabs, inputs behave). Read each artboard with designCanvas.read({ tabId: "${o.design.id}", file }). Show it with designCanvas.prototype({ tabId: "${o.design.id}", html, title }) — that opens it as an html canvas tab linked to this design (do not use canvas.show for it). Start with the shell and the first screen, then call designCanvas.prototype again as you fill the other screens. Not links on the design canvas (its Preview already does that), and do not change the design canvas.`;

/** The core endpoints of a design canvas tab (Speca's /canvas/:tab/<what>), by `what`. */
export async function core(ctx: Context, session: Session | null, o: Opts, what: string): Promise<Response> {
    const req = o.req, method = req.method.toUpperCase();
    if (method === "POST" && !(await csrfOk(ctx, req))) return new Response("forbidden", { status: 403 });
    const who = await personOf(ctx, session, req);
    const locale = await localeOf(ctx, req), t = makeT(locale);
    const url = new URL(req.url), q = url.searchParams;
    // a comment's thread (Speca /canvas/comments/:id/:what)
    if (what.startsWith("cm:")) {
        const cm = await store.getComment(ctx, o.params.id ?? "");
        const tab = cm && await store.getTab(ctx, cm.tab_id);
        if (!cm || !tab) return new Response("not found", { status: 404 });
        const f = await formOf(req), act = what.slice(3);
        if (act === "reply") { const text = String(f.text ?? "").trim(); if (text) { await store.replyComment(ctx, cm, { author: `user:${who.id}`, name: who.name, text }); note(ctx, tab.id, `The person replied to comment ${cm.id}: "${text.slice(0, 200)}"`); } return new Response(null, { status: 204 }); }
        if (act === "resolve") { await store.resolveComment(ctx, cm, `user:${who.id}`, f.undo !== "1"); return new Response(null, { status: 204 }); }
        if (act === "remove") { await store.removeComment(ctx, cm); return new Response(null, { status: 204 }); }
        if (act === "send") { const n = await sendComments(ctx, tab, [cm], who, t); return n < 0 ? new Response("no chat", { status: 409 }) : new Response(null, { status: 204 }); }
        return new Response("not found", { status: 404 });
    }
    const tab = await store.getTab(ctx, o.params.tab ?? "");
    if (!tab) return new Response("not found", { status: 404 });
    const C = `${BASE}/c/${tab.id}`;
    switch (`${method} ${what}`) {
        case "GET page": return htmlRes(await page(ctx, who, tab, locale, await ctx.fns.auth.csrfToken({ req }).catch(() => "") ?? "", { tz: q.get("tz") ?? undefined }), { "x-frame-options": "SAMEORIGIN" });
        case "GET in": return htmlRes(await canvasIn(ctx, who, tab, locale));
        case "GET body": return htmlRes(await tabBody(ctx, who, tab, locale, { version: q.get("v") ? Number(q.get("v")) : undefined, compare: q.has("compare"), at: Number(q.get("at")) || undefined }));
        case "GET journal": return htmlRes(await journalHtml(ctx, who, tab, t));
        case "POST restore": {
            const v = Number((await formOf(req)).v);
            const drop = v === tab.version;
            if (drop) await store.discardDraft(ctx, tab.id); else await store.restoreVersion(ctx, tab.id, v, `user:${who.id}`);
            note(ctx, tab.id, drop ? `The person dropped the draft: the canvas is v${v} again, the last saved version.` : `The person brought v${v} back into the draft.`);
            const now = (await store.getTab(ctx, tab.id))!;
            return htmlRes(await tabBody(ctx, who, now, locale), hxToast(drop ? t("canvas.dropped", { v }) : t("canvas.restored", { v })));
        }
        case "POST commit": { const { row, committed } = await store.commitTab(ctx, tab.id, `user:${who.id}`, (await formOf(req)).name); return committed ? toast(t("canvas.saved", { v: row.version })) : new Response(null, { status: 204 }); }
        case "POST revert": { const row = await store.revertTo(ctx, tab.id, Number((await formOf(req)).n)); if (row) note(ctx, tab.id, "The person took the canvas back to an earlier moment of its draft."); return new Response(null, { status: 204 }); }
        case "POST vname": { await store.renameVersion(ctx, tab.id, Number(o.params.v), String((await formOf(req)).name ?? "")); return new Response(null, { status: 204 }); }
        case "POST vdelete": { const gone = await store.deleteVersions(ctx, tab.id, Number(o.params.v), { others: (await formOf(req)).others === "1" }); return toast(t("canvas.verDeleted", { n: gone.length })); }
        case "POST undo": case "POST redo": {
            const r = await store.undoMine(ctx, tab.id, who.id, what === "redo");
            if ("row" in r) { note(ctx, tab.id, `The person ${what === "redo" ? "brought back" : "undid"} their own change${r.note ? `: ${r.note}` : ""}. Do not redo it unless they ask.`); return new Response(null, { status: 204 }); }
            return Response.json({ reason: r.none }, { status: 409 });
        }
        case "GET work": {
            // what the agent draws right now (Speca: from the session's activity); here: the artboard it wrote last while it
            // is still working (its chat is running), for a short while
            const w = ((ctx.state as any).designCanvas?.work ?? {})[tab.id];
            return Response.json({ work: w && Date.now() - w.at < 20_000 ? [{ tabId: tab.id, file: w.file, phase: "writing", chars: 0, since: w.at, who: null }] : [] });
        }
        case "GET comments": return Response.json({ comments: (await store.listComments(ctx, tab.id, { open: q.get("all") !== "1" })).map((x) => cmJson(x, who.id)) });
        case "POST comments": {
            const f = await formOf(req);
            const body = String(f.body ?? "").trim();
            if (!body) return new Response("empty", { status: 400 });
            const num = (v: unknown) => Math.min(1, Math.max(0, Number(v) || 0));
            let design: Record<string, unknown> | undefined;
            try {
                const d = JSON.parse(String(f.design ?? "null"));
                const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined);
                if (d && typeof d.file === "string" && /^[\w .()-]{1,80}\.html$/.test(d.file)) design = { file: d.file, tid: Number.isInteger(d.tid) ? Number(d.tid) : -1, path: String(d.path ?? "").slice(0, 200), fp: String(d.fp ?? "").slice(0, 80), ...(n(d.px) !== undefined ? { px: n(d.px) } : {}), ...(n(d.py) !== undefined ? { py: n(d.py) } : {}) };
            } catch { design = undefined; }
            const anchor = { path: String(f.path ?? "").slice(0, 500), text: String(f.text ?? "").slice(0, 300), fx: num(f.fx), fy: num(f.fy), ...(design ? { design } : {}) };
            const cm = await store.addComment(ctx, { tabId: tab.id, author: `user:${who.id}`, name: who.name, anchor, label: String(f.label ?? ""), body });
            if (f.send === "1") { if ((await sendComments(ctx, tab, [cm], who, t)) < 0) note(ctx, tab.id, `The person left comment ${cm.id} for you.`); }
            else note(ctx, tab.id, `The person left comment ${cm.id} (kept, not sent): "${body.slice(0, 200)}" on ${cm.label}`);
            return Response.json(cmJson((await store.getComment(ctx, cm.id))!, who.id));
        }
        case "POST comments/send": {
            const mine = (await store.listComments(ctx, tab.id, { open: true })).filter((x) => !x.sent_at && x.author === `user:${who.id}`);
            const n = await sendComments(ctx, tab, mine, who, t);
            return n < 0 ? new Response("no chat", { status: 409 }) : Response.json({ sent: n });
        }
        case "POST comments/resolve": return Response.json({ resolved: await store.resolveAll(ctx, tab.id, `user:${who.id}`) });
        case "POST comments/remove": {
            const f = await formOf(req);
            const ids = f.all === "1" ? null : String(f.ids ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 500);
            if (ids && !ids.length) return Response.json({ removed: 0 });
            return Response.json({ removed: await store.removeComments(ctx, tab.id, `user:${who.id}`, ids) });
        }
        case "POST prototype": {
            // Speca: the canvas says "the agent is on it" until it is done, and the agent is asked as the person
            const dir = tab.proto ? "update" : "build";
            const text = `${dir === "update" ? t("proto.askUpdate", { title: tab.proto!.title }) : t("proto.askBuild")}\n\n${PROTO_ASK({ dir, design: tab })}`;
            if (!(await sendToAgent(ctx, tab, text))) return toast(t.locale === "ru" ? "У холста нет чата с агентом" : "This canvas has no agent chat", "error");
            await store.setSync(ctx, tab.id, dir === "update" ? "forward" : "build");
            return toast(t("proto.asked"));
        }
        case "POST prototype/open": {
            if (!tab.proto) return new Response("not found", { status: 404 });
            try { await ctx.fns.canvas.update({ agentId: tab.proto.agentId, open: true, activeItemId: tab.proto.itemId }); } catch { return new Response("gone", { status: 410 }); }
            return new Response(null, { status: 204 });
        }
        case "GET thumb": return thumb(ctx, tab.id, req);
    }
    void C; void showTab; void KIND; void designKey;
    return new Response("not found", { status: 404 });
}
