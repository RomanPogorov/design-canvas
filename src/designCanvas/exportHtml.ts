/**
 * All artboards of a design canvas as one self-contained HTML page (page by page, each artboard at its size with
 * its title) — to download, hand over, or print to PDF as a deck.
 *
 * Use when the person wants the design outside Hyper. Each artboard is a sandboxed frame of its rendered HTML
 * (templates and components expanded, no editor marks).
 * @param opts.name The canvas name.
 * @param opts.version A saved version instead of the current canvas.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas name. */
    name: string;
    /** A saved version instead of the current canvas. */
    version?: number;
}): Promise<string> {
    const c = opts.version ? (await ctx.fns.designCanvas.version({ name: opts.name, version: opts.version })).canvas : await ctx.fns.designCanvas.load({ name: opts.name });
    if (!c) throw new Error(`designCanvas.exportHtml: no canvas "${opts.name}"`);
    const esc = (s: string) => Bun.escapeHTML(s);
    const pages = c.sheets.length ? c.sheets : [{ id: "main", title: "" }];
    const parts: string[] = [];
    for (const p of pages) {
        const files = c.order.filter((f) => c.boards[f] && !c.boards[f]!.pending && (c.boards[f]!.sheet ?? pages[0]!.id) === p.id);
        if (!files.length) continue;
        if (p.title) parts.push(`<h2 class="pg">${esc(p.title)}</h2>`);
        for (const f of files) {
            const b = c.boards[f]!, doc = (await ctx.fns.designCanvas.boardPage({ canvas: c, file: f, mode: "static" }))!;
            parts.push(`<section class="ab"><h3>${esc(b.title)} <small>${b.w}×${b.h} · ${esc(f)}</small></h3><iframe sandbox title="${esc(b.title)}" width="${b.w}" height="${b.h}" srcdoc="${esc(doc)}"></iframe></section>`);
        }
    }
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.title)}</title><style>body{margin:0;padding:32px;background:#f4f4f5;font:14px system-ui,-apple-system,sans-serif;color:#18181b}h1{font-size:22px;margin:0 0 24px}.pg{font-size:18px;margin:40px 0 16px}.ab{margin:0 0 40px;break-inside:avoid;page-break-after:always}.ab h3{font-size:14px;margin:0 0 8px}.ab small{color:#71717a;font-weight:400}iframe{display:block;border:0;background:#fff;box-shadow:0 1px 3px #0002;max-width:100%}@media print{body{background:#fff;padding:0}}</style></head><body><h1>${esc(c.title)}</h1>${parts.join("\n") || "<p>No artboards drawn yet.</p>"}</body></html>`;
}
