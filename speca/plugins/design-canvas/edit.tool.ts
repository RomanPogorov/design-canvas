import { defineTool, z } from "speca/sdk";
import { FILE } from "./lib/model.ts";
import { loadBoard } from "./lib/tools.ts";
import { alikeNotes, alikeNote } from "./lib/lint.ts";

export default defineTool({
  description: "Change part of one artboard by replacing exact snippets of its HTML (like editing code): each edit has `old` (exact, unique unless `all`) and `new`. All edits apply together or none. The way to make every change that is not a full redraw.",
  effect: "read", category: "canvas", title: { en: "Edited an artboard", ru: "Поправил артборд" },
  args: z.object({ tabId: z.string(), file: z.string().regex(FILE), edits: z.array(z.object({ old: z.string().min(1), new: z.string(), all: z.boolean().optional() }).strict()).min(1).max(60), note: z.string().max(200).optional() }).strict(),
  summary: (a) => `${a.file} · ${a.edits.length} edit(s)`,
  async run(a, api) {
    const b = await loadBoard(api, a.tabId);
    if ("error" in b) return { text: b.error, isError: true };
    let text = b.state.files[a.file];
    if (text === undefined) return { text: b.state.boards[a.file]?.pending ? `${a.file} is planned but not drawn yet: draw it with design-canvas_write.` : `No artboard ${a.file}. Boards: ${b.state.order.join(", ")}.`, isError: true };
    const problems: string[] = [];
    a.edits.forEach((e, i) => {
      const n = text!.split(e.old).length - 1;
      if (n === 0) problems.push(`edit ${i + 1}: \`old\` not found (read the file with design-canvas_read)`);
      else if (n > 1 && !e.all) problems.push(`edit ${i + 1}: \`old\` occurs ${n} times — make it unique or set "all": true`);
      else text = e.all ? text!.split(e.old).join(e.new) : text!.replace(e.old, () => e.new);
    });
    if (problems.length) return { text: `Nothing was changed.\n${problems.join("\n")}`, isError: true };
    b.state.files[a.file] = text = (await api.canvas.keepImages?.(text!)) ?? text!;   // photos by link become the person's files
    await api.canvas.write(b.id, { state: b.state, note: a.note ?? `${b.state.boards[a.file]?.title ?? a.file}: ${a.edits.length} edit(s)` });
    // the board being changed comes into view if it is off screen or on another page (not while the person looks around)
    await api.canvas.show(b.id, { focus: a.file, follow: true }).catch(() => {});
    return { text: `${a.file}: ${a.edits.length} edit(s) applied.${alikeNote(alikeNotes(a.file, text!))}`,
      meta: { places: [{ tabId: b.id, focus: a.file, title: b.state.boards[a.file]?.title ?? a.file }] } };
  },
});
