/**
 * Changes part of one artboard by replacing exact snippets of its HTML, like editing code.
 *
 * Use for every change that is not a full redraw: each edit has `old` (an exact piece of the current file, unique
 * unless `all`) and `new`. All edits apply together or none — on a problem nothing is written and the error says
 * which edit failed (read the file again with designCanvas.read). The person may have edited the board by hand:
 * read before you change, keep what they changed.
 * @param opts.name The canvas name.
 * @param opts.file The artboard file.
 * @param opts.edits 1–60 replacements `{ old, new, all? }`.
 * @param opts.note What the change is, kept as the canvas's last change.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas name. */
    name: string;
    /** The artboard file. */
    file: string;
    /** 1–60 replacements. */
    edits: Array<{ old: string; new: string; all?: boolean }>;
    /** What the change is. */
    note?: string;
}): Promise<{ file: string; applied: number; notes: string[] }> {
    const c = await ctx.fns.designCanvas.load({ name: opts.name });
    if (!c) throw new Error(`designCanvas.edit: no canvas "${opts.name}"`);
    let text = c.files[opts.file];
    if (text === undefined || c.boards[opts.file]?.pending) throw new Error(c.boards[opts.file] ? `designCanvas.edit: ${opts.file} is planned but not drawn yet — draw it with designCanvas.write` : `designCanvas.edit: no artboard ${opts.file}; boards: ${c.order.join(", ")}`);
    const edits = Array.isArray(opts.edits) ? opts.edits : [];
    if (!edits.length || edits.length > 60) throw new Error("designCanvas.edit: give 1–60 edits");
    const problems: string[] = [];
    edits.forEach((e, i) => {
        if (!e || typeof e.old !== "string" || !e.old || typeof e.new !== "string") { problems.push(`edit ${i + 1}: needs old (non-empty) and new`); return; }
        const n = text!.split(e.old).length - 1;
        if (n === 0) problems.push(`edit ${i + 1}: \`old\` not found (read the file with designCanvas.read)`);
        else if (n > 1 && !e.all) problems.push(`edit ${i + 1}: \`old\` occurs ${n} times — make it unique or set all: true`);
        else text = e.all ? text!.split(e.old).join(e.new) : text!.replace(e.old, () => e.new);
    });
    if (problems.length) throw new Error(`designCanvas.edit: nothing was changed.\n${problems.join("\n")}`);
    c.files[opts.file] = text!;
    await ctx.fns.designCanvas.save({ canvas: c, note: opts.note ?? `${c.boards[opts.file]?.title ?? opts.file}: ${edits.length} edit(s)` });
    return { file: opts.file, applied: edits.length, notes: ctx.fns.designCanvas.alikeNotes({ file: opts.file, src: text! }) };
}
