import * as store from "../../sdk/store.ts";
import { agentWho } from "../../sdk/agent.ts";

/**
 * Lists design canvases — this agent's (or all, with `all`): id, title, artboards, waiting ones, open comments, draft edits.
 * @param opts.all Every design canvas of the instance, not only this agent's. @default false
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Every design canvas. */ all?: boolean;
} = {}): Promise<Array<{ tabId: string; title: string; boards: number; waiting: number; comments: number; draftEdits: number; version: number; url: string }>> {
    const who = await agentWho(ctx);
    const rows = await store.listTabs(ctx, !opts.all && who.agentId ? { agentId: who.agentId } : {});
    return Promise.all(rows.map(async (r) => {
        const order: string[] = r.state?.order ?? [];
        return { tabId: r.id, title: r.title, boards: order.length, waiting: order.filter((f) => r.state.boards?.[f]?.pending).length, comments: (await store.listComments(ctx, r.id, { open: true })).length, draftEdits: r.draft_edits, version: r.version, url: `/designCanvas/t/${r.id}` };
    }));
}
