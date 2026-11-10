/**
 * The design canvas as the editor needs it: the index (boards, notes, pages, comments) without the files, plus for
 * each artboard the key of what its frame shows (reload when it changes) and the version of its file (edits name
 * it, so a stale view never writes).
 *
 * Use for the editor page and its polling route; not needed by agents.
 * @param opts.canvas The canvas.
 */
export default function (ctx: Context, _session: Session | null, opts: {
    /** The canvas. */
    canvas: types.designCanvas.Canvas;
}): Record<string, unknown> {
    const c = opts.canvas;
    const keys: Record<string, string> = {}, v: Record<string, string> = {};
    for (const f of c.order) if (c.files[f] !== undefined) { keys[f] = ctx.fns.designCanvas.renderKey({ file: f, files: c.files }); v[f] = Bun.hash(c.files[f]!).toString(36); }
    return { name: c.name, title: c.title, rev: c.rev, order: c.order, boards: c.boards, notes: c.notes, sheets: c.sheets.length ? c.sheets : [{ id: "main", title: "" }],
        comments: c.comments, keys, v, note: c.note ?? "", updatedAt: c.updatedAt ?? "" };
}
