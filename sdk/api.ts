// The PluginApi Speca's core hands every call of the design-canvas plugin (a route, a tool, the canvas render) —
// the part of it the plugin uses, built over the plugin's own store (sdk/store.ts) and Hyper (canvas tabs, agents).
import { makeT, type T } from "../speca/core/i18n/i18n.ts";
import * as store from "./store.ts";

export const KIND = "design-canvas.board";
/** Who acts: the signed-in person (a route) or the agent (its designCanvas.* call). */
export type Who = { kind: "user" | "agent"; id: string; name: string; agentId?: string | null };
export type CanvasComment = {
    id: string; author: string; authorName: string; label: string; body: string; resolved: boolean; at: string;
    anchor: { path: string; text: string; fx: number; fy: number; design?: { file: string; tid: number; path: string; fp: string; px?: number; py?: number } };
    replies: Array<{ author: string; name: string; text: string; at: string }>;
};
export type ToolOutput = { text: string; meta?: Record<string, unknown>; isError?: boolean; images?: unknown[] };
export type PluginApi = ReturnType<typeof makeApi>;
export type CanvasCtx = PluginApi;

/** The locale of the canvas UI: the setting designCanvas.locale ("ru" — the default — | "en" | "auto": the browser's language). */
export async function localeOf(ctx: Context, req?: Request): Promise<"ru" | "en"> {
    let s = "ru";
    try { s = String(await ctx.fns.settings.getString({ module: "designCanvas", scopeType: "global", key: "locale", fallback: "auto" }) ?? "auto"); } catch { /* settings absent */ }
    if (s === "ru" || s === "en") return s;
    const h = req?.headers.get("accept-language") ?? "";
    return /^\s*en\b/i.test(h) ? "en" : "ru";
}

export const commentJson = (c: store.CommentRow): CanvasComment => ({ id: c.id, author: c.author, authorName: c.author_name, label: c.label, body: c.body, resolved: !!c.resolved_at, at: new Date(c.created_at).toISOString(), anchor: c.anchor as CanvasComment["anchor"], replies: c.replies ?? [] });

export function makeApi(ctx: Context, who: Who, o: { tabId?: string | null; version?: number | null; at?: number | null; locale?: "ru" | "en"; focus?: { target: string; at: number; follow?: boolean } | null } = {}) {
    const author = who.kind === "agent" ? "agent" : `user:${who.id}`;
    const t: T = makeT(o.locale ?? "ru");
    const api = {
        pluginId: "design-canvas",
        user: { id: who.id, email: "", name: who.name, tz: "UTC", locale: t.locale },
        t,
        now: () => new Date(),
        tabId: o.tabId ?? null,
        version: o.version ?? null,
        at: o.at ?? null,
        focus: o.focus ?? null,
        block: false,
        canvas: {
            async view(tabId: string) {
                const tab = await store.getTab(ctx, tabId);
                if (!tab) return null;
                return { id: tab.id, sessionId: tab.id, kind: KIND, title: tab.title, state: tab.state, ownerId: tab.owner_id ?? "", canAct: true, allowOrigins: [] as string[], shared: false };
            },
            async get(tabId: string) { const v = await api.canvas.view(tabId); return v && { id: v.id, sessionId: v.sessionId, kind: v.kind, title: v.title, state: v.state }; },
            async write(tabId: string, w: { state: Record<string, unknown>; note?: string; title?: string }) {
                const row = await store.writeTab(ctx, tabId, w.state as Record<string, any>, author, w.note, w.title);
                return { version: row.version, draftEdits: row.draft_edits };
            },
            async open(w: { kind: string; title: string; state: Record<string, unknown> }) {
                const agentId = who.agentId ?? null;
                const row = await store.openTab(ctx, { agentId, ownerId: who.kind === "user" ? who.id : null, title: w.title, state: w.state as Record<string, any>, author });
                await showTab(ctx, row.id, agentId, row.title);
                return { tabId: row.id };
            },
            async list() { return (await store.listTabs(ctx, who.agentId ? { agentId: who.agentId } : {})).map((r) => ({ id: r.id, kind: KIND, title: r.title, state: r.state })); },
            async show(tabId: string, s?: { focus?: string; follow?: boolean }) {
                const tab = await store.getTab(ctx, tabId);
                if (!tab) return;
                if (s?.focus) (((ctx.state as any).designCanvas ??= {}).focus ??= {})[tabId] = { target: s.focus, at: Date.now(), follow: !!s.follow };
                if (!s?.follow) await showTab(ctx, tabId, tab.agent_id, tab.title);
                store.signalCanvas(ctx, tabId);
            },
            async stateAt(tabId: string, s: { v?: number | null; at?: number | null }) { return store.stateAt(ctx, tabId, s); },
            presence: async (tabId: string, state?: Record<string, unknown> | null) => {
                if (!(await store.getTab(ctx, tabId))) throw new Error("not found");
                return store.presence(ctx, tabId, { id: who.id, name: who.name }, state);
            },
            async comments(tabId: string, c?: { all?: boolean }) { return (await store.listComments(ctx, tabId, { open: !c?.all })).map(commentJson); },
            async replyComment(id: string, text: string) { const c = await store.getComment(ctx, id); if (c) await store.replyComment(ctx, c, { author, name: who.name, text }); },
            async resolveComment(id: string) { const c = await store.getComment(ctx, id); if (c) await store.resolveComment(ctx, c, author); },
            kindFor: () => null,
        },
    };
    return api;
}

/** The canvas tab of a design in its agent's Hyper canvas (kind designCanvas.board), opened or brought to the front. */
export async function showTab(ctx: Context, tabId: string, agentId: string | null, title: string): Promise<number | null> {
    if (!agentId) return null;
    try {
        const shown: any = await ctx.fns.canvas.show({ agentId, kind: "designCanvas.board", args: { id: tabId }, title });
        return shown?.id ?? null;
    } catch { return null; }
}
