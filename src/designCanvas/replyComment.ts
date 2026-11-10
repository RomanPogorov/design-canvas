import * as store from "../../sdk/store.ts";

/**
 * Replies in the thread of one of the person's comments on a design canvas, leaving it open.
 * @param opts.commentId The comment id.
 * @param opts.text The reply.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The comment id. */ commentId: string;
    /** The reply. */ text: string;
}): Promise<{ replied: true; id: string }> {
    const c = await store.getComment(ctx, String(opts.commentId ?? ""));
    if (!c) throw new Error(`designCanvas.replyComment: no comment "${opts.commentId}"`);
    if (!String(opts.text ?? "").trim()) throw new Error("designCanvas.replyComment: text is required");
    await store.replyComment(ctx, c, { author: "agent", name: "Agent", text: String(opts.text).trim() });
    return { replied: true, id: c.id };
}
