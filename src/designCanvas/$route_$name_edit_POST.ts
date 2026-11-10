const FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,60}\.html$/;
const ELEMENT_OPS = new Set(["style", "text", "delete", "duplicate", "move", "attr", "wrap", "unwrap"]);

/**
 * Applies the person's edit of one artboard from the editor: an element operation by tids (designCanvas.elementOp),
 * a data edit of a repeat copy (`op: "data"`, designCanvas.dataOp) or a whole file put back (`op: "set"`, undo).
 * `v` is the version of the file the person was looking at: if it changed since, nothing is written (409).
 * CSRF-protected via the x-csrf-token header. Answers the new version, what to select and the file before (undo).
 * @param opts.req Incoming HTTP request with JSON `{ file, v, op, … }`.
 * @param opts.params Route parameters: the canvas name.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming HTTP request with JSON. */ req: Request;
    /** Route parameters: the canvas name. */ params: { name: string } }) {
    const req = opts.req;
    if (!await ctx.fns.auth.verifyCsrf({ req, token: req.headers.get("x-csrf-token") ?? "" })) return Response.json({ error: "invalid csrf token" }, { status: 403 });
    const text = await req.text();
    if (text.length > 1_000_000) return Response.json({ error: "too large" }, { status: 413 });
    let a: any;
    try { a = JSON.parse(text); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }
    let c;
    try { c = await ctx.fns.designCanvas.load({ name: opts.params.name }); }
    catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
    if (!c) return Response.json({ error: "not found" }, { status: 404 });
    if (!a || !FILE.test(String(a.file)) || c.files[a.file] === undefined) return Response.json({ error: "not found" }, { status: 404 });
    const src = c.files[a.file]!;
    const v = Bun.hash(src).toString(36);
    if (String(a.v ?? "") !== v) return Response.json({ error: "stale", v }, { status: 409 });
    const title = c.boards[a.file]?.title ?? a.file;
    let html: string, note: string, select: number | undefined, item: string | undefined;
    if (a.op === "set") {
        if (typeof a.html !== "string" || a.html.length > 400_000) return Response.json({ error: "bad" }, { status: 400 });
        html = a.html; note = `${title}: undo`;
    } else if (a.op === "data") {
        const r = ctx.fns.designCanvas.dataOp({ src, action: a.action, path: String(a.path ?? ""), value: a.value });
        if ("error" in r) return Response.json(r, { status: r.error === "stale" ? 409 : 422 });
        html = r.html; item = r.item; note = `${title}: data ${a.action} ${a.path}`;
    } else if (ELEMENT_OPS.has(a.op)) {
        const tids = (Array.isArray(a.tids) ? a.tids : [a.tid]).map(Number).filter((n: number) => Number.isInteger(n) && n >= 0).slice(0, 500);
        const r = ctx.fns.designCanvas.elementOp({ src, op: a.op, tids, changes: a.changes, text: a.text, html: a.html, template: a.template === true, dir: a.dir, name: a.name, value: a.value, layout: a.layout });
        if ("error" in r) return Response.json(r, { status: r.error === "stale" ? 409 : 422 });
        html = r.html; select = r.select; note = `${title}: ${r.note}`;
    } else return Response.json({ error: "bad op" }, { status: 400 });
    c.files[a.file] = html;
    const saved = await ctx.fns.designCanvas.save({ canvas: c, note });
    return Response.json({ ok: true, v: Bun.hash(html).toString(36), key: ctx.fns.designCanvas.renderKey({ file: a.file, files: c.files }), select, item, before: src, rev: saved.rev, note });
}
