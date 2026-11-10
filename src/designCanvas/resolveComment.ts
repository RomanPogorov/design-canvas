import * as store from "../../sdk/store.ts";

/**
 * Resolves one of the person's comments on a design canvas once you have acted on it, optionally with a short reply
 * in its thread (the person sees it on the pin). Speca's design-canvas_layout op resolveComment.
 * @param opts.commentId The comment id (from designCanvas.comments or designCanvas.read).
 * @param opts.reply A short reply to leave in the thread first.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The comment id. */ commentId: string;
    /** A short reply. */ reply?: string;
}): Promise<{ resolved: true; id: string }> {
    const c = await store.getComment(ctx, String(opts.commentId ?? ""));
    if (!c) throw new Error(`designCanvas.resolveComment: no comment "${opts.commentId}"`);
    if (opts.reply?.trim()) await store.replyComment(ctx, c, { author: "agent", name: "Agent", text: opts.reply.trim() });
    await store.resolveComment(ctx, c, "agent");
    return { resolved: true, id: c.id };
}
