import { join } from "node:path";

/**
 * Maps a design canvas name to its folder, index file and versions folder inside the designs directory.
 *
 * Names are letters, digits, `-` and `_` (1–80); anything else (dots, slashes, absolute paths) is rejected, so a
 * name can never escape the directory.
 * @param opts.name Canvas name such as `onboarding`.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Canvas name: letters, digits, `-`, `_`. */
    name: string;
}): Promise<{ name: string; dir: string; index: string; versions: string }> {
    const name = String(opts.name ?? "").trim();
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(name)) throw new Error(`designCanvas: invalid canvas name "${opts.name}" (letters, digits, - and _)`);
    const dir = join(await ctx.fns.designCanvas.dir({}), name);
    return { name, dir, index: join(dir, "canvas.json"), versions: join(dir, ".versions") };
}
