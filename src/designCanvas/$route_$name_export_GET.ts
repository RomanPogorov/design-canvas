/**
 * Downloads all artboards of a design canvas as one HTML page (`?ver=N`: a saved version).
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters: the canvas name.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming HTTP request. */ req: Request;
    /** Route parameters: the canvas name. */ params: { name: string } }) {
    const ver = Number(new URL(opts.req.url).searchParams.get("ver")) || undefined;
    let html: string;
    try { html = await ctx.fns.designCanvas.exportHtml({ name: opts.params.name, version: ver }); }
    catch (e: any) { return new Response(e.message, { status: 404 }); }
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
        "content-disposition": `attachment; filename="${opts.params.name}${ver ? `-v${ver}` : ""}.html"` } });
}
