import { defineTool, z } from "speca/sdk";
import { FILE, layoutRows, type DesignState } from "./lib/model.ts";
import { alikeNotes, alikeNote } from "./lib/lint.ts";

const board = z.object({ file: z.string().regex(FILE), title: z.string().min(1).max(120), w: z.number().int().min(80).max(4000), h: z.number().int().min(80).max(20000), page: z.boolean().optional(), html: z.string().min(1).max(400_000).optional() }).strict();

export default defineTool({
  description: "Open a design canvas with the plan: every screen and state as an artboard (file, title, size), in rows by flow (one row per flow or screen family, the row's title above it; boards 80px apart, rows 120px apart — computed for you). Leave out `html`: the canvas opens at once with each artboard waiting, and the person watches them appear as you draw them one by one with design-canvas_write, in the plan's order. Put html in here only for one or two small boards. Returns the tab id.",
  effect: "read", category: "canvas", title: { en: "Opened a design canvas", ru: "Открыл дизайн-холст" },
  args: z.object({ title: z.string().min(1).max(200), rows: z.array(z.object({ title: z.string().max(120).optional(), boards: z.array(board).min(1).max(24) }).strict()).min(1).max(12) }).strict(),
  summary: (a) => `${a.title} · ${a.rows.reduce((n, r) => n + r.boards.length, 0)} boards`,
  async run(a, api) {
    const files: Record<string, string> = {}, seen = new Set<string>(), waiting: string[] = [];
    for (const r of a.rows) for (const b of r.boards) {
      if (seen.has(b.file)) return { text: `Duplicate file name ${b.file}.`, isError: true };
      seen.add(b.file);
      if (b.html) files[b.file] = (await api.canvas.keepImages?.(b.html)) ?? b.html; else waiting.push(b.file);
    }
    const state: DesignState = { title: a.title, ...layoutRows(a.rows), files };
    // planned, not drawn: the canvas shows these frames waiting until design-canvas_write fills them
    for (const f of waiting) state.boards[f]!.pending = true;
    const { tabId } = await api.canvas.open({ kind: "board", title: a.title, state });
    return {
      text: `Opened design canvas ${tabId} with ${seen.size} artboard(s)${waiting.length ? `; waiting to be drawn, in this order: ${waiting.join(", ")} — draw each with design-canvas_write (one call per artboard)` : ""}.${alikeNote(Object.entries(files).flatMap(([f, h]) => alikeNotes(f, h)))}`,
      meta: { tabId },
    };
  },
});
