import * as store from "../../sdk/store.ts";
import { needTab } from "../../sdk/agent.ts";

/**
 * Saves the canvas's draft as a new named version — when the person asks to save or snapshot one, and before you try
 * another direction (name it after the idea, so the person can compare and bring it back). Ordinary edits need no
 * commit: they stay in the draft («Черновик · N правок»), which the person sees and can undo. Speca's canvas_commit.
 * @param opts.tabId The design canvas id.
 * @param opts.name The version's name, e.g. "Bottom tabs, cards".
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The design canvas id. */ tabId: string;
    /** The version's name. */ name?: string;
}): Promise<{ version: number; committed: boolean }> {
    const tab = await needTab(ctx, opts.tabId);
    const { row, committed } = await store.commitTab(ctx, tab.id, "agent", opts.name ?? null);
    return { version: row.version, committed };
}
