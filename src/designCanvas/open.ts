const FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,60}\.html$/;

/**
 * Opens a new design canvas with the plan: every screen and state as an artboard (file, title, size), in rows by
 * flow, and shows it on the agent's canvas.
 *
 * Use first when designing screens, an app, a flow, a landing or slides: one row per flow or screen family with
 * its title above it; boards 80px apart, rows 120px apart (computed). Leave out `html`: the canvas opens at once
 * with each artboard waiting, and the person watches them appear as you draw them one by one with
 * designCanvas.write, in the plan's order. Put `html` here only for one or two small boards. Sizes: phone 390×844,
 * tablet 834×1194, desktop 1440×900, slide 1280×720. Returns the canvas name (pass it to every other
 * designCanvas function), its address and the files still waiting.
 * @param opts.title The canvas's title.
 * @param opts.rows Rows by flow: `{ title?, boards: [{ file, title, w, h, page?, html? }] }` (1–12 rows, 1–24 boards each).
 * @param opts.name Folder name (letters, digits, - _); default: from the title, made unique.
 * @param opts.show Open it as a tab on the current agent's canvas. @default true
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas's title. */
    title: string;
    /** Rows by flow. */
    rows: Array<{ title?: string; boards: Array<{ file: string; title: string; w: number; h: number; page?: boolean; html?: string }> }>;
    /** Folder name; default: from the title, made unique. */
    name?: string;
    /** Open it as a tab on the current agent's canvas. @default true */
    show?: boolean;
}): Promise<{ name: string; url: string; boards: number; waiting: string[]; notes: string[] }> {
    const title = String(opts.title ?? "").trim().slice(0, 200);
    if (!title) throw new Error("designCanvas.open: title is required");
    const rows = Array.isArray(opts.rows) ? opts.rows : [];
    if (!rows.length || rows.length > 12) throw new Error("designCanvas.open: give 1–12 rows of boards");
    let name = String(opts.name ?? "").trim();
    if (name) {
        if (await ctx.fns.designCanvas.load({ name })) throw new Error(`designCanvas.open: canvas "${name}" exists — draw into it with designCanvas.write, or pick another name`);
    } else {
        const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `design-${new Date().toISOString().slice(0, 10)}`;
        name = base;
        for (let i = 2; await ctx.fns.designCanvas.load({ name }); i++) name = `${base}-${i}`;
    }
    const canvas: types.designCanvas.Canvas = { name, title, rev: 0, order: [], boards: {}, notes: {}, sheets: [], comments: {}, files: {} };
    const waiting: string[] = [], notes: string[] = [];
    let y = 0;
    rows.forEach((row, i) => {
        const boards = Array.isArray(row.boards) ? row.boards : [];
        if (!boards.length || boards.length > 24) throw new Error(`designCanvas.open: row ${i + 1} needs 1–24 boards`);
        const width = boards.reduce((w, b) => w + Number(b.w), 0) + 80 * Math.max(0, boards.length - 1);
        if (row.title) { canvas.notes[`row${i + 1}`] = { kind: "title", text: String(row.title).slice(0, 120), x: 0, y, w: Math.max(width, 390) }; y += 300; }
        let x = 0, hmax = 0;
        for (const b of boards) {
            if (!FILE.test(String(b.file))) throw new Error(`designCanvas.open: bad file name "${b.file}" (like 01-welcome.html)`);
            if (canvas.boards[b.file]) throw new Error(`designCanvas.open: duplicate file name ${b.file}`);
            const w = Math.round(Number(b.w)), h = Math.round(Number(b.h));
            if (!(w >= 80 && w <= 4000 && h >= 80 && h <= 20000)) throw new Error(`designCanvas.open: ${b.file} needs w 80–4000 and h 80–20000`);
            canvas.boards[b.file] = { x, y, w, h, title: String(b.title || b.file.replace(/\.html$/, "")).slice(0, 120), ...(b.page ? { page: true } : {}) };
            canvas.order.push(b.file);
            if (b.html) { canvas.files[b.file] = b.html; notes.push(...ctx.fns.designCanvas.alikeNotes({ file: b.file, src: b.html })); }
            else { canvas.boards[b.file]!.pending = true; waiting.push(b.file); }
            x += w + 80; hmax = Math.max(hmax, h);
        }
        y += hmax + 120;
    });
    await ctx.fns.designCanvas.save({ canvas, note: `opened with ${canvas.order.length} artboard(s)` });
    if (opts.show !== false) {
        try { await ctx.fns.canvas.show({ kind: "designCanvas.board", args: { name }, title }); } catch { /* no agent canvas here (a script, a test) */ }
    }
    return { name, url: `/designCanvas/${name}`, boards: canvas.order.length, waiting, notes };
}
