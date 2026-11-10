/**
 * Lists the saved versions of a design canvas as JSON for the editor.
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters: the canvas name.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming HTTP request. */ req: Request;
    /** Route parameters: the canvas name. */ params: { name: string } }) {
    try { return Response.json(await ctx.fns.designCanvas.versions({ name: opts.params.name }), { headers: { "cache-control": "no-store" } }); }
    catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
}
