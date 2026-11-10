/**
 * Opens the design canvas editor for one canvas (the page the canvas tab frames).
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters: the canvas name.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming HTTP request. */ req: Request;
    /** Route parameters: the canvas name. */ params: { name: string } }) {
    let c;
    try { c = await ctx.fns.designCanvas.load({ name: opts.params.name }); }
    catch (e: any) { return new Response(e.message, { status: 400 }); }
    if (!c) return new Response(`No design canvas "${Bun.escapeHTML(opts.params.name)}". Ask the agent to open one with designCanvas.open.`, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
    const csrf = await ctx.fns.auth.csrfToken({ req: opts.req });
    const html = await ctx.fns.designCanvas.editorPage({ canvas: c, csrf });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "SAMEORIGIN" } });
}
