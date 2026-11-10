/**
 * Reads a design canvas for the agent: without `file` the index — pages, artboards with titles, sizes, positions and
 * which are still waiting, row titles and stickies, open comments with the element they are pinned to; with
 * `file` that artboard's outline (`#tid tag "text"`) and its HTML source.
 *
 * Use before changing anything the person may have touched, and to resolve an address like `Main.html#12` (tid 12)
 * the person points at. `version` reads a saved version instead of the current canvas; `rendered: true` returns
 * the file as drawn (data, repeats, components expanded) instead of its source.
 * @param opts.name The canvas name.
 * @param opts.file An artboard file; omit for the index.
 * @param opts.version A saved version number (designCanvas.versions); omit for the current canvas.
 * @param opts.rendered With `file`: the HTML after templates instead of the source. @default false
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas name. */
    name: string;
    /** An artboard file; omit for the index. */
    file?: string;
    /** A saved version number; omit for the current canvas. */
    version?: number;
    /** With `file`: the HTML after templates instead of the source. @default false */
    rendered?: boolean;
}): Promise<string> {
    const c = opts.version ? (await ctx.fns.designCanvas.version({ name: opts.name, version: opts.version })).canvas : await ctx.fns.designCanvas.load({ name: opts.name });
    if (!c) throw new Error(`designCanvas.read: no canvas "${opts.name}"`);
    if (!opts.file) {
        const pages = c.sheets.length ? c.sheets : [{ id: "main", title: "" }], many = pages.length > 1;
        const pageOf = (x: { sheet?: string }) => pages.find((p) => p.id === x.sheet) ?? pages[0]!;
        const boards = c.order.filter((f) => c.boards[f]).map((f) => {
            const b = c.boards[f]!;
            return `- ${f} · "${b.title}" · ${b.w}×${b.h}${b.page ? " page" : ""} at ${b.x},${b.y}${many ? ` · page "${pageOf(b).title}"` : ""}${b.pending ? " · waiting to be drawn (designCanvas.write)" : ""}`;
        });
        const notes = Object.entries(c.notes).map(([id, n]) => `- note ${id} (${n.kind}) "${n.text.slice(0, 60)}" at ${n.x},${n.y}${many ? ` · page "${pageOf(n).title}"` : ""}`);
        const comments = Object.entries(c.comments).filter(([, k]) => !k.resolved).map(([id, k]) =>
            `- comment ${id} on [${k.label}](${k.file}${k.tid >= 0 ? `#${k.tid}` : ""}) by ${k.by}: "${k.text.slice(0, 400)}"${(k.replies ?? []).map((r) => `\n    ↳ ${r.by}: "${r.text.slice(0, 200)}"`).join("")}`);
        return `Design canvas "${c.title}" (name ${c.name}, rev ${c.rev}${opts.version ? `, version ${opts.version}` : ""}) — /designCanvas/${c.name}`
            + (many ? `\nPages: ${pages.map((p) => `"${p.title}"`).join(", ")}` : "")
            + `\nArtboards:\n${boards.join("\n") || "(none)"}`
            + (notes.length ? `\nNotes:\n${notes.join("\n")}` : "")
            + (comments.length ? `\nOpen comments (reply / resolve with designCanvas.layout):\n${comments.join("\n")}` : "")
            + (c.note ? `\nLast change: ${c.note}${c.updatedAt ? ` (${c.updatedAt})` : ""}` : "");
    }
    const src = c.files[opts.file];
    if (src === undefined || c.boards[opts.file]?.pending) throw new Error(c.boards[opts.file]?.pending ? `designCanvas.read: ${opts.file} is planned but not drawn yet — draw it with designCanvas.write` : `designCanvas.read: no artboard ${opts.file}; boards: ${c.order.join(", ")}`);
    const html = opts.rendered ? ctx.fns.designCanvas.render({ src, files: c.files }) : src;
    return `${opts.file} — "${c.boards[opts.file]?.title ?? opts.file}"\n\nOutline (#tid tag "text"):\n${ctx.fns.designCanvas.outline({ src })}\n\n${opts.rendered ? "Rendered HTML" : "HTML"}:\n${html.slice(0, 60_000)}`;
}
