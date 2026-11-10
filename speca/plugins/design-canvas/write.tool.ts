import { defineTool, z } from "speca/sdk";
import { FILE, placeNew, sheetsOf } from "./lib/model.ts";
import { loadBoard } from "./lib/tools.ts";
import { alikeNotes, alikeNote } from "./lib/lint.ts";

export default defineTool({
  description: "Add an artboard to a design canvas, or replace one artboard's whole file. New boards go to the right of the last row (of their page) unless x/y are given. `sheet`: the page of the canvas to put a new board on, by its title (made if missing) — for separate sets like flows or variants. For small changes use design-canvas_edit instead.",
  effect: "read", category: "canvas", title: { en: "Drew an artboard", ru: "Нарисовал артборд" },
  args: z.object({ tabId: z.string(), file: z.string().regex(FILE), html: z.string().min(1).max(400_000), title: z.string().max(120).optional(), w: z.number().int().min(80).max(4000).optional(), h: z.number().int().min(80).max(20000).optional(), page: z.boolean().optional(), sheet: z.string().trim().min(1).max(80).optional(), x: z.number().optional(), y: z.number().optional() }).strict(),
  summary: (a) => a.file,
  async run(a, api) {
    const b = await loadBoard(api, a.tabId);
    if ("error" in b) return { text: b.error, isError: true };
    const s = b.state;
    const prev = s.boards[a.file];
    const w = a.w ?? prev?.w ?? 390, h = a.h ?? prev?.h ?? 844;
    // the page it goes on: named by its title, made if missing (the first page gets a name then too)
    let sheet = prev?.sheet;
    if (a.sheet && !prev) {
      const list = sheetsOf(s), hit = list.find((p) => p.title.toLowerCase() === a.sheet!.toLowerCase() || p.id === a.sheet);
      if (hit) sheet = hit.id;
      else { s.sheets = list.map((p) => (p.title ? p : { ...p, title: api.t.locale === "ru" ? "Страница 1" : "Page 1" })); sheet = `p${Date.now().toString(36)}`; s.sheets.push({ id: sheet, title: a.sheet }); }
      if (sheet === sheetsOf(s)[0]!.id) sheet = undefined;
    }
    const pos = prev ? { x: a.x ?? prev.x, y: a.y ?? prev.y } : a.x !== undefined && a.y !== undefined ? { x: a.x, y: a.y } : placeNew(s, w, h, sheet ?? sheetsOf(s)[0]!.id);
    // a planned artboard drawn now stops waiting (the new entry has no `pending`)
    s.boards[a.file] = { ...pos, w, h, title: a.title ?? prev?.title ?? a.file.replace(/\.html$/, ""), ...(a.page ?? prev?.page ? { page: true } : {}), ...(sheet ? { sheet } : {}) };
    if (!s.order.includes(a.file)) s.order.push(a.file);
    s.files[a.file] = (await api.canvas.keepImages?.(a.html)) ?? a.html;   // photos by link become the person's files
    await api.canvas.write(b.id, { state: s, note: `${prev && !prev.pending ? "redrew" : "drew"} ${s.boards[a.file]!.title}` });
    // the person follows the work: a board drawn now comes into view, on its page (a whole new page of ten boards was
    // once finished off-screen — "ready", and the person had to ask where)
    if (!prev || prev.pending) await api.canvas.show(b.id, { focus: a.file, follow: true }).catch(() => {});
    const left = s.order.filter((f) => s.boards[f]?.pending);
    return { text: `${prev?.pending ? "Drew" : prev ? "Replaced" : "Added"} ${a.file} (${w}×${h}).${left.length ? ` Still waiting, in order: ${left.join(", ")}.` : ""}${alikeNote(alikeNotes(a.file, a.html))}`,
      meta: { places: [{ tabId: b.id, focus: a.file, title: s.boards[a.file]!.title }] } };
  },
});
