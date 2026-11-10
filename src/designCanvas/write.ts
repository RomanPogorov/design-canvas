const FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,60}\.html$/;

/**
 * Draws one artboard of a design canvas: adds it, fills a planned (waiting) one, or replaces its whole file.
 *
 * Use once per artboard, in the plan's order, after designCanvas.open; for small changes use designCanvas.edit.
 * A new board goes 80px right of the last row of its page unless x/y are given; `sheet` puts a new board on a page
 * by title (made if missing) — for separate sets like the admin, variants or a new flow. Follow the artboard file
 * rules of this plugin's SKILL.md (one root element, fluid layout, inline styles, real tags, no network, data +
 * <dc-for> for lists, <dc-import> for shared parts). Returns what it did, the artboards still waiting and notes
 * about elements of one kind written unevenly.
 * @param opts.name The canvas name (from designCanvas.open).
 * @param opts.file The artboard file, e.g. `02-sign-in.html`.
 * @param opts.html The artboard's whole HTML.
 * @param opts.title Its title; default: the planned one or the file name.
 * @param opts.w Width in px; default: the planned one or 390.
 * @param opts.h Height in px; default: the planned one or 844.
 * @param opts.page A page root (max-width container, fluid) rather than a fixed screen.
 * @param opts.sheet For a new board: the page of the canvas to put it on, by title (made if missing).
 * @param opts.x For a new board: x in the world.
 * @param opts.y For a new board: y in the world.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas name. */
    name: string;
    /** The artboard file, e.g. `02-sign-in.html`. */
    file: string;
    /** The artboard's whole HTML. */
    html: string;
    /** Its title. */
    title?: string;
    /** Width in px. */
    w?: number;
    /** Height in px. */
    h?: number;
    /** A page root rather than a fixed screen. */
    page?: boolean;
    /** For a new board: the page of the canvas, by title. */
    sheet?: string;
    /** For a new board: x in the world. */
    x?: number;
    /** For a new board: y in the world. */
    y?: number;
}): Promise<{ file: string; did: "drew" | "added" | "replaced"; w: number; h: number; waiting: string[]; notes: string[] }> {
    const c = await ctx.fns.designCanvas.load({ name: opts.name });
    if (!c) throw new Error(`designCanvas.write: no canvas "${opts.name}" — open one with designCanvas.open`);
    if (!FILE.test(String(opts.file))) throw new Error(`designCanvas.write: bad file name "${opts.file}" (like 02-sign-in.html)`);
    const html = String(opts.html ?? "");
    if (!html.trim()) throw new Error("designCanvas.write: html is empty");
    const prev = c.boards[opts.file];
    const w = Math.round(opts.w ?? prev?.w ?? 390), h = Math.round(opts.h ?? prev?.h ?? 844);
    let sheet = prev?.sheet;
    if (opts.sheet && !prev) sheet = ctx.fns.designCanvas.findSheet({ canvas: c, title: opts.sheet });
    const pos = prev ? { x: opts.x ?? prev.x, y: opts.y ?? prev.y }
        : opts.x !== undefined && opts.y !== undefined ? { x: opts.x, y: opts.y } : ctx.fns.designCanvas.placeNew({ canvas: c, sheet });
    c.boards[opts.file] = { ...pos, w, h, title: String(opts.title ?? prev?.title ?? opts.file.replace(/\.html$/, "")).slice(0, 120),
        ...((opts.page ?? prev?.page) ? { page: true } : {}), ...(sheet ? { sheet } : {}) };
    if (!c.order.includes(opts.file)) c.order.push(opts.file);
    c.files[opts.file] = html;
    const did = prev?.pending ? "drew" : prev ? "replaced" : "added";
    await ctx.fns.designCanvas.save({ canvas: c, note: `${did} ${c.boards[opts.file]!.title}` });
    return { file: opts.file, did, w, h, waiting: c.order.filter((f) => c.boards[f]?.pending), notes: ctx.fns.designCanvas.alikeNotes({ file: opts.file, src: html }) };
}
