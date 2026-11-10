import { join } from "node:path";

/**
 * Loads one saved version of a design canvas (the whole canvas as it was when it was saved).
 *
 * Use to look at or compare an earlier state; designCanvas.read and the editor's frames take `version` too.
 * @param opts.name The canvas name.
 * @param opts.version The version number (designCanvas.versions lists them).
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas name. */
    name: string;
    /** The version number. */
    version: number;
}): Promise<{ version: number; label: string; at: string; canvas: types.designCanvas.Canvas }> {
    const p = await ctx.fns.designCanvas.paths({ name: opts.name });
    const v = Math.floor(Number(opts.version));
    if (!(v >= 1)) throw new Error("designCanvas.version: version is a number from 1");
    const f = Bun.file(join(p.versions, `${String(v).padStart(4, "0")}.json`));
    if (!(await f.exists())) throw new Error(`designCanvas.version: canvas "${p.name}" has no version ${v}`);
    const raw: any = await f.json();
    return { version: v, label: String(raw.label ?? ""), at: String(raw.at ?? ""), canvas: { ...raw.canvas, name: p.name } };
}
