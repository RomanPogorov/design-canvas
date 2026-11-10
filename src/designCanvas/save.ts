import { mkdir, readdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

const FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,60}\.html$/;
const MAX_FILE = 400_000;

/**
 * Saves a whole design canvas to its folder: changed artboard files written, removed ones deleted, the index
 * (canvas.json) rewritten with `rev` + 1. Open editors pick the change up within a couple of seconds.
 *
 * Use only with a canvas from designCanvas.load that you changed; the agent's API (open, write, edit, layout)
 * calls it for you. Checks file names, sizes (400 KB per artboard) and that every board's file is drawn or pending.
 * @param opts.canvas The canvas to store.
 * @param opts.note What this save did, kept as the canvas's last change ("drew 02 Sign in").
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas to store. */
    canvas: types.designCanvas.Canvas;
    /** What this save did. */
    note?: string;
}): Promise<{ name: string; rev: number }> {
    const c = opts.canvas;
    const p = await ctx.fns.designCanvas.paths({ name: c.name });
    for (const [f, html] of Object.entries(c.files)) {
        if (!FILE.test(f)) throw new Error(`designCanvas: bad artboard file name "${f}" (like Home.html: letters, digits, . - _)`);
        if (typeof html !== "string" || html.length > MAX_FILE) throw new Error(`designCanvas: ${f} is over ${MAX_FILE} characters`);
    }
    for (const [f, b] of Object.entries(c.boards)) {
        if (!FILE.test(f)) throw new Error(`designCanvas: bad artboard file name "${f}"`);
        if (![b.x, b.y, b.w, b.h].every(Number.isFinite) || b.w < 40 || b.h < 40 || b.w > 4000 || b.h > 20000) throw new Error(`designCanvas: ${f} has a bad position or size`);
        if (!b.pending && c.files[f] === undefined) c.files[f] = "";
    }
    await mkdir(p.dir, { recursive: true });
    const onDisk = new Set((await readdir(p.dir).catch(() => [] as string[])).filter((n) => FILE.test(n)));
    for (const [f, html] of Object.entries(c.files)) {
        const path = join(p.dir, f);
        if (onDisk.has(f) && (await Bun.file(path).text()) === html) continue;
        await Bun.write(path, html);
    }
    for (const f of onDisk) if (c.files[f] === undefined) await unlink(join(p.dir, f)).catch(() => {});
    const rev = (Number(c.rev) || 0) + 1;
    const index = { title: c.title, rev, order: c.order.filter((f) => c.boards[f]), boards: c.boards, notes: c.notes, sheets: c.sheets, comments: c.comments,
        note: opts.note ?? c.note ?? "", updatedAt: new Date().toISOString() };
    const tmp = `${p.index}.${process.pid}.tmp`;
    await Bun.write(tmp, JSON.stringify(index, null, 2));
    await rename(tmp, p.index);
    c.rev = rev;
    return { name: p.name, rev };
}
