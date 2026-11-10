const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Applies the person's layout operations from the editor (move, resize, rename, duplicate, remove artboards; notes;
 * pages; comments) through designCanvas.layout. CSRF-protected via the x-csrf-token header.
 * @param opts.req Incoming HTTP request with `{ ops }` JSON.
 * @param opts.params Route parameters: the canvas name.
 */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Incoming HTTP request with `{ ops }` JSON. */ req: Request;
    /** Route parameters: the canvas name. */ params: { name: string } }) {
    const req = opts.req;
    if (!await ctx.fns.auth.verifyCsrf({ req, token: req.headers.get("x-csrf-token") ?? "" })) return Response.json({ error: "invalid csrf token" }, { status: 403 });
    const text = await req.text();
    if (text.length > MAX_BYTES) return Response.json({ error: "too large" }, { status: 413 });
    let body: any;
    try { body = JSON.parse(text); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }
    // the router has put the signed-in person on the session; a direct dispatch resolves them from the request
    const user = (session as any)?.user ?? (await ctx.fns.auth.currentUser({ req }).catch(() => null))?.user;
    try {
        const r = await ctx.fns.designCanvas.layout({ name: opts.params.name, ops: Array.isArray(body?.ops) ? body.ops : [], by: String(user?.name || user?.email || "person") });
        return Response.json({ ok: true, ...r });
    } catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
}
