import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Lists the saved versions of a design canvas, newest first: number, label, time, artboard count.
 *
 * Use to find a version to read, compare or bring back (designCanvas.restore).
 * @param opts.name The canvas name.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas name. */
    name: string;
}): Promise<Array<{ version: number; label: string; at: string; boards: number }>> {
    const p = await ctx.fns.designCanvas.paths({ name: opts.name });
    const out: Array<{ version: number; label: string; at: string; boards: number }> = [];
    for (const n of await readdir(p.versions).catch(() => [] as string[])) {
        const m = /^(\d{4,})\.json$/.exec(n);
        if (!m) continue;
        const raw: any = await Bun.file(join(p.versions, n)).json().catch(() => null);
        if (raw) out.push({ version: Number(m[1]), label: String(raw.label ?? ""), at: String(raw.at ?? ""), boards: Object.keys(raw.canvas?.boards ?? {}).length });
    }
    return out.sort((a, b) => b.version - a.version);
}
