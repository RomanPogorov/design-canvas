import * as store from "../../sdk/store.ts";
import { needTab, notesFor } from "../../sdk/agent.ts";

/**
 * Lists the person's comments on a design canvas, each with the element it is pinned to (its artboard address
 * `File.html#tid:path` — read that artboard with designCanvas.read to find the element) and its replies. Open ones by
 * default; `all` adds the resolved and sent ones. Speca's canvas_comments.
 * @param opts.tabId The design canvas id.
 * @param opts.all Include resolved comments. @default false
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The design canvas id. */ tabId: string;
    /** Include resolved comments. */ all?: boolean;
}): Promise<{ text: string; comments: Array<{ id: string; by: string; text: string; label: string; address: string; resolved: boolean; sent: boolean; replies: Array<{ name: string; text: string }> }> }> {
    const tab = await needTab(ctx, opts.tabId);
    const rows = await store.listComments(ctx, tab.id, { open: !opts.all });
    return {
        text: store.commentsText(rows) + notesFor(ctx, tab.id),
        comments: rows.map((c) => ({ id: c.id, by: c.author_name, text: c.body, label: c.label, address: String(c.anchor.path ?? ""), resolved: !!c.resolved_at, sent: !!c.sent_at, replies: (c.replies ?? []).map((r) => ({ name: r.name, text: r.text })) })),
    };
}
