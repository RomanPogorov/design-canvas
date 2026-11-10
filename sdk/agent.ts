// The agent's side: Speca's design-canvas tools (../speca/plugins/design-canvas/*.tool.ts) run as they are with the
// api Speca gives a tool, as the agent; and what Speca's core gives every canvas (comments, commit, versions,
// screenshot, the prototype link) over the plugin's store. Each ctx.fns.designCanvas.* function is one of these.
import { makeApi, showTab, type Who } from "./api.ts";
import * as store from "./store.ts";
import { takeNotes } from "./http.ts";
import { designKey } from "./chrome.ts";

/** The agent calling (Hyper: agent.current), or a nameless one outside an agent's turn (a test, the REPL). */
export async function agentWho(ctx: Context): Promise<Who> {
    let id: string | null = null;
    try { id = String((await ctx.fns.agent.current({}))?.id ?? "") || null; } catch { id = null; }
    return { kind: "agent", id: "agent", name: "Agent", agentId: id };
}
/** Speca's names in a tool's answer → Hyper's (design-canvas_write → designCanvas.write, canvas_screenshot → …). */
const hyperNames = (s: string) => s.replace(/design-canvas_(\w+)/g, "designCanvas.$1").replace(/\bcanvas_(screenshot|comments|commit)\b/g, "designCanvas.$1").replace(/\bcanvas_list\b/g, "designCanvas.list");

export async function runTool(ctx: Context, def: { args: any; run: (a: any, api: any) => Promise<any> }, raw: Record<string, unknown>): Promise<{ text: string; tabId?: string; error?: boolean }> {
    const a = { ...raw };
    if (a.id !== undefined && a.tabId === undefined) { a.tabId = a.id; delete a.id; }
    const p = def.args.safeParse(a);
    if (!p.success) throw new Error(`designCanvas: bad arguments — ${p.error.issues.map((i: any) => `${i.path.join(".") || "args"}: ${i.message}`).join("; ")}`);
    const who = await agentWho(ctx);
    const api = makeApi(ctx, who, { tabId: (p.data as any).tabId ?? null });
    const out = await def.run(p.data, api);
    const o = typeof out === "string" ? { text: out } : out;
    if (o.isError) throw new Error(hyperNames(o.text));
    const tabId = (o.meta?.tabId as string | undefined) ?? (p.data as any).tabId;
    // the canvas covers the artboard the agent is drawing for a short while (Speca: the session's activity)
    const file = (p.data as any).file;
    if (tabId && file) (((ctx.state as any).designCanvas ??= {}).work ??= {})[tabId] = { file, at: Date.now() };
    return { text: hyperNames(o.text), ...(tabId ? { tabId } : {}) };
}

/** The person's changes the agent has not heard of yet (Speca tells it in quiet messages), once. */
export const notesFor = (ctx: Context, tabId: string) => { const n = takeNotes(ctx, tabId); return n.length ? `\n\nSince you last looked:\n${n.map((x) => `- ${x}`).join("\n")}` : ""; };

export async function needTab(ctx: Context, id: string): Promise<store.TabRow> {
    const tab = await store.getTab(ctx, String(id ?? ""));
    if (!tab) throw new Error(`designCanvas: no design canvas "${id}" (use the id from designCanvas.open or designCanvas.list)`);
    return tab;
}

/** The prototype of a design (Speca: an html tab opened with canvas_open {from}): a Hyper html canvas tab, linked. */
export async function prototype(ctx: Context, o: { tabId: string; html: string; title?: string }): Promise<{ itemId: number; text: string }> {
    const tab = await needTab(ctx, o.tabId);
    const who = await agentWho(ctx);
    const agentId = who.agentId ?? tab.agent_id;
    if (!agentId) throw new Error("designCanvas.prototype: call it from the agent's chat (the prototype opens on its canvas)");
    const title = o.title?.trim() || tab.proto?.title || `${tab.title} — prototype`;
    const shown: any = await ctx.fns.canvas.show({ agentId, kind: "html", args: { html: o.html }, title });
    await store.setProto(ctx, tab.id, { itemId: Number(shown.id), agentId, title, designKey: designKey(tab.state), protoKey: Bun.hash(o.html).toString(36) });
    return { itemId: Number(shown.id), text: `Prototype of "${tab.title}" is canvas tab ${shown.id} (html), linked to design canvas ${tab.id}: the design shows «Прототип», and «Обновить прототип» once the design changes. Try it with canvas screenshots before saying it works.` };
}
export { showTab };
