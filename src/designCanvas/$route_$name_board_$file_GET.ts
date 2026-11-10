const FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,60}\.html$/;

/**
 * Serves one artboard into its sandboxed frame: rendered, with the in-frame picker (`?mode=play` for Preview,
 * `?mode=static` for a still picture; `?ver=N` shows a saved version).
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters: the canvas name and the artboard file.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming HTTP request. */ req: Request;
    /** Route parameters: the canvas name and the artboard file. */ params: { name: string; file: string } }) {
    const file = decodeURIComponent(opts.params.file ?? "");
    if (!FILE.test(file)) return new Response("not found", { status: 404 });
    const q = new URL(opts.req.url).searchParams, ver = Number(q.get("ver")) || 0;
    const mode = q.get("mode") === "play" ? "play" : q.get("mode") === "static" ? "static" : "edit";
    let c;
    try { c = ver ? (await ctx.fns.designCanvas.version({ name: opts.params.name, version: ver })).canvas : await ctx.fns.designCanvas.load({ name: opts.params.name }); }
    catch (e: any) { return new Response(e.message, { status: 404 }); }
    const html = c ? await ctx.fns.designCanvas.boardPage({ canvas: c, file, mode }) : null;
    if (html === null) return new Response("not found", { status: 404 });
    return new Response(html, { headers: {
        "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
        // the frame is sandboxed (opaque origin) by its iframe; on top: no network but pictures and styles, inline code only
        "content-security-policy": "default-src 'none'; img-src * data: blob:; media-src * data: blob:; style-src 'unsafe-inline' *; font-src * data:; script-src 'unsafe-inline'; frame-ancestors 'self'",
    } });
}
