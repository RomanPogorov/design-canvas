/**
 * Saves a named version of a design canvas (`{ label }`) or restores one (`{ restore: N }`). CSRF-protected via
 * the x-csrf-token header.
 * @param opts.req Incoming HTTP request with JSON.
 * @param opts.params Route parameters: the canvas name.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming HTTP request with JSON. */ req: Request;
    /** Route parameters: the canvas name. */ params: { name: string } }) {
    const req = opts.req;
    if (!await ctx.fns.auth.verifyCsrf({ req, token: req.headers.get("x-csrf-token") ?? "" })) return Response.json({ error: "invalid csrf token" }, { status: 403 });
    const body: any = await req.json().catch(() => null);
    try {
        if (body && Number(body.restore) > 0) return Response.json(await ctx.fns.designCanvas.restore({ name: opts.params.name, version: Number(body.restore) }));
        return Response.json(await ctx.fns.designCanvas.commit({ name: opts.params.name, label: typeof body?.label === "string" ? body.label : undefined }));
    } catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
}
