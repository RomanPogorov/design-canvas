import { readdir } from "node:fs/promises";
import { join } from "node:path";

const FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,60}\.html$/;

/**
 * Loads a design canvas from its folder: the index (canvas.json) and every artboard file, or null when it does not exist.
 *
 * Use to get the whole canvas as data (boards, notes, pages, comments, files). Agents usually want
 * designCanvas.read instead, which formats it for reading. An artboard file on disk without a board entry is
 * still loaded into `files` (a hand-added component).
 * @param opts.name Canvas name such as `onboarding`.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Canvas name. */
    name: string;
}): Promise<types.designCanvas.Canvas | null> {
    const p = await ctx.fns.designCanvas.paths({ name: opts.name });
    const f = Bun.file(p.index);
    if (!(await f.exists())) return null;
    const raw: any = await f.json();
    const files: Record<string, string> = {};
    for (const n of await readdir(p.dir).catch(() => [] as string[])) if (FILE.test(n)) files[n] = await Bun.file(join(p.dir, n)).text();
    const boards: Record<string, types.designCanvas.Board> = raw.boards && typeof raw.boards === "object" ? raw.boards : {};
    const order = (Array.isArray(raw.order) ? raw.order : []).filter((x: unknown) => typeof x === "string" && boards[x as string]);
    for (const b of Object.keys(boards)) if (!order.includes(b)) order.push(b);
    return {
        name: p.name, title: String(raw.title ?? p.name), rev: Number(raw.rev) || 0, order, boards,
        notes: raw.notes && typeof raw.notes === "object" ? raw.notes : {},
        sheets: Array.isArray(raw.sheets) ? raw.sheets : [],
        comments: raw.comments && typeof raw.comments === "object" ? raw.comments : {},
        files, note: raw.note, updatedAt: raw.updatedAt,
    };
}
