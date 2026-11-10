/**
 * The design canvas index as JSON for the editor (polled to pick up the agent's and others' changes).
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters: the canvas name.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming HTTP request. */ req: Request;
    /** Route parameters: the canvas name. */ params: { name: string } }) {
    let c;
    try { c = await ctx.fns.designCanvas.load({ name: opts.params.name }); }
    catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
    if (!c) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(ctx.fns.designCanvas.clientState({ canvas: c }), { headers: { "cache-control": "no-store" } });
}
