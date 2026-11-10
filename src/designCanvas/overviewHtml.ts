/**
 * A still picture of one page of a design canvas as HTML: every drawn artboard where it sits (scaled to at most
 * `maxWidth`), with its title, plus row titles and stickies — what designCanvas.screenshot photographs.
 * @param opts.canvas The canvas.
 * @param opts.sheet The page id; default: the first page.
 * @param opts.maxWidth Widest the picture may be, px. @default 2400
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas. */
    canvas: types.designCanvas.Canvas;
    /** The page id; default: the first page. */
    sheet?: string;
    /** Widest the picture may be, px. @default 2400 */
    maxWidth?: number;
}): Promise<{ html: string; width: number; height: number }> {
    const c = opts.canvas, esc = (s: string) => Bun.escapeHTML(s);
    const first = c.sheets[0]?.id ?? "main", want = opts.sheet ?? first;
    const on = (x: { sheet?: string }) => (x.sheet && c.sheets.some((s) => s.id === x.sheet) ? x.sheet : first) === want;
    const boards = c.order.filter((f) => c.boards[f] && on(c.boards[f]!)).map((f) => [f, c.boards[f]!] as const);
    const notes = Object.values(c.notes).filter(on);
    const boxes = [...boards.map(([, b]) => ({ x: b.x, y: b.y - 40, w: b.w, h: b.h + 40 })), ...notes.map((n) => ({ x: n.x, y: n.y, w: n.w ?? 300, h: n.kind === "title" ? 80 : 160 }))];
    if (!boxes.length) return { html: `<!doctype html><body style="font:16px system-ui;padding:40px">No artboards on this page.</body>`, width: 600, height: 200 };
    const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
    const pad = 40, s = Math.min(1, (opts.maxWidth ?? 2400) / (x1 - x0 + pad * 2));
    const parts: string[] = [];
    for (const n of notes) parts.push(`<div class="${n.kind}" style="left:${n.x - x0 + pad}px;top:${n.y - y0 + pad}px;${n.w ? `width:${n.w}px` : ""}">${esc(n.text)}</div>`);
    for (const [f, b] of boards) {
        const left = b.x - x0 + pad, top = b.y - y0 + pad;
        parts.push(`<div class="t" style="left:${left}px;top:${top - 30}px;max-width:${b.w}px">${esc(b.title)}</div>`);
        if (b.pending) { parts.push(`<div class="ab wait" style="left:${left}px;top:${top}px;width:${b.w}px;height:${b.h}px">Waiting to be drawn</div>`); continue; }
        const doc = (await ctx.fns.designCanvas.boardPage({ canvas: c, file: f, mode: "static" })) ?? "";
        parts.push(`<iframe class="ab" sandbox style="left:${left}px;top:${top}px" width="${b.w}" height="${b.h}" srcdoc="${esc(doc)}"></iframe>`);
    }
    const W = Math.ceil((x1 - x0 + pad * 2) * s), H = Math.ceil((y1 - y0 + pad * 2) * s);
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#f1f1f3;font-family:system-ui,-apple-system,sans-serif}#w{position:relative;transform:scale(${s});transform-origin:0 0;width:${x1 - x0 + pad * 2}px;height:${y1 - y0 + pad * 2}px}#w>*{position:absolute}.ab{border:0;background:#fff;box-shadow:0 1px 2px #0000001a,0 4px 16px #0000000f}.wait{display:grid;place-items:center;color:#71717a;background:repeating-linear-gradient(135deg,#fff 0 12px,#f6f6f8 12px 24px);font-size:18px}.t{font-size:18px;color:#5f5f6b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.title{font:600 56px/1.15 system-ui,sans-serif;color:#18181b}.sticky{width:240px;min-height:120px;padding:16px;background:#fff3a8;color:#3f3a12;font-size:18px;box-sizing:border-box;white-space:pre-wrap}</style></head><body><div id="w">${parts.join("")}</div></body></html>`;
    return { html, width: W, height: H };
}
