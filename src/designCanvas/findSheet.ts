/**
 * Finds a page (sheet) of a design canvas by its title or id, or adds it (the canvas is changed in place).
 *
 * Use to put artboards on a named page: the first time a canvas gets a second page, its first page is named
 * "Page 1". Returns the page id, or undefined for the first page (boards on it carry no `sheet`).
 * @param opts.canvas The canvas (its `sheets` may be extended).
 * @param opts.title The page's title (case-insensitive) or id.
 */
export default function (_ctx: Context, _session: Session | null, opts: {
    /** The canvas (its `sheets` may be extended). */
    canvas: types.designCanvas.Canvas;
    /** The page's title or id. */
    title: string;
}): string | undefined {
    const c = opts.canvas, want = String(opts.title ?? "").trim();
    if (!want) return undefined;
    const list = c.sheets?.length ? c.sheets : [{ id: "main", title: "" }];
    let hit = list.find((p) => p.title.toLowerCase() === want.toLowerCase() || p.id === want);
    if (!hit) {
        c.sheets = list.map((p, i) => (p.title ? p : { ...p, title: `Page ${i + 1}` }));
        hit = { id: `p${Date.now().toString(36)}${c.sheets.length}`, title: want.slice(0, 80) };
        c.sheets.push(hit);
    } else if (!c.sheets?.length) c.sheets = list;
    return hit.id === c.sheets[0]!.id ? undefined : hit.id;
}
