import * as store from "../../sdk/store.ts";
import { needTab } from "../../sdk/agent.ts";

/**
 * Lists the saved versions of a design canvas (number, name, who, when) and the draft's edits since the last one.
 * @param opts.tabId The design canvas id.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The design canvas id. */ tabId: string;
}): Promise<{ current: number; draftEdits: number; versions: Array<{ v: number; name: string | null; author: string; at: string }>; draft: Array<{ n: number; note: string | null; author: string }> }> {
    const tab = await needTab(ctx, opts.tabId);
    const vs = await store.versions(ctx, tab.id);
    const ed = await store.draftEdits(ctx, tab.id);
    return { current: tab.version, draftEdits: tab.draft_edits, versions: vs.map((v) => ({ v: v.v, name: v.note, author: v.author, at: new Date(v.created_at).toISOString() })), draft: ed.map((e) => ({ n: e.n, note: e.note, author: e.author })) };
}
