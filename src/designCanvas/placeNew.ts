/**
 * Where a new artboard goes on a design canvas: 80px to the right of the last row of its page (0,0 on an empty page).
 *
 * Use when adding an artboard without explicit coordinates; designCanvas.write and layout's toSheet do.
 * @param opts.canvas The canvas.
 * @param opts.sheet The page id; none: the first page.
 */
export default function (_ctx: Context, _session: Session | null, opts: {
    /** The canvas. */
    canvas: Pick<types.designCanvas.Canvas, "boards" | "sheets">;
    /** The page id; none: the first page. */
    sheet?: string;
}): { x: number; y: number } {
    const c = opts.canvas, first = c.sheets?.[0]?.id ?? "main";
    const pageOf = (b: { sheet?: string }) => (b.sheet && (c.sheets ?? []).some((s) => s.id === b.sheet) ? b.sheet : first);
    const want = opts.sheet && (c.sheets ?? []).some((s) => s.id === opts.sheet) ? opts.sheet : first;
    const all = Object.values(c.boards).filter((b) => pageOf(b) === want);
    if (!all.length) return { x: 0, y: 0 };
    const lastY = Math.max(...all.map((b) => b.y));
    const right = Math.max(...all.filter((b) => b.y === lastY).map((b) => b.x + b.w));
    return { x: right + 80, y: lastY };
}
