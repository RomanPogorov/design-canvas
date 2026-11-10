/**
 * Brings a saved version of a design canvas back as its current state; what was there is saved as a version first.
 *
 * Use when the person picks an earlier direction. Comments stay as they are now (they are not part of a design
 * direction). Returns the version restored and the version that keeps the replaced state.
 * @param opts.name The canvas name.
 * @param opts.version The version number to bring back.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas name. */
    name: string;
    /** The version number to bring back. */
    version: number;
}): Promise<{ restored: number; saved: number; rev: number }> {
    const cur = await ctx.fns.designCanvas.load({ name: opts.name });
    if (!cur) throw new Error(`designCanvas.restore: no canvas "${opts.name}"`);
    const v = await ctx.fns.designCanvas.version({ name: opts.name, version: opts.version });
    const saved = await ctx.fns.designCanvas.commit({ name: opts.name, label: `Before restoring "${v.label}"` });
    const next: types.designCanvas.Canvas = { ...v.canvas, name: cur.name, rev: cur.rev, comments: cur.comments };
    const r = await ctx.fns.designCanvas.save({ canvas: next, note: `restored version ${v.version} "${v.label}"` });
    return { restored: v.version, saved: saved.version, rev: r.rev };
}
