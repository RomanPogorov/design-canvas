import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Saves the current state of a design canvas as a named version.
 *
 * Use when the person asks to save or snapshot a version, and before trying another direction: name it after the
 * idea ("Bottom tabs, cards") so the person can compare and bring it back (designCanvas.restore). Ordinary edits
 * need no version. Returns the version number.
 * @param opts.name The canvas name.
 * @param opts.label A short name for the version, e.g. the idea it holds.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas name. */
    name: string;
    /** A short name for the version. */
    label?: string;
}): Promise<{ version: number; label: string }> {
    const c = await ctx.fns.designCanvas.load({ name: opts.name });
    if (!c) throw new Error(`designCanvas.commit: no canvas "${opts.name}"`);
    const p = await ctx.fns.designCanvas.paths({ name: c.name });
    const last = (await ctx.fns.designCanvas.versions({ name: c.name }))[0]?.version ?? 0;
    const version = last + 1, label = String(opts.label ?? "").trim().slice(0, 200) || `Version ${version}`;
    await mkdir(p.versions, { recursive: true });
    await Bun.write(join(p.versions, `${String(version).padStart(4, "0")}.json`), JSON.stringify({ label, at: new Date().toISOString(), canvas: c }));
    return { version, label };
}
