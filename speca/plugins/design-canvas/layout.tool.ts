import { defineTool, z } from "speca/sdk";
import { loadBoard } from "./lib/tools.ts";
import { placeNew, sheetsOf } from "./lib/model.ts";

const op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("move"), file: z.string(), x: z.number(), y: z.number() }).strict(),
  z.object({ op: z.literal("rename"), file: z.string(), title: z.string().min(1).max(120) }).strict(),
  z.object({ op: z.literal("remove"), file: z.string() }).strict(),
  z.object({ op: z.literal("resize"), file: z.string(), w: z.number().int().min(80), h: z.number().int().min(80) }).strict(),
  z.object({ op: z.literal("note"), id: z.string().max(40), kind: z.enum(["title", "sticky"]), text: z.string().max(2000), x: z.number(), y: z.number(), w: z.number().optional() }).strict(),
  z.object({ op: z.literal("removeNote"), id: z.string() }).strict(),
  z.object({ op: z.literal("toSheet"), file: z.string(), sheet: z.string().min(1).max(80) }).strict(),
  z.object({ op: z.literal("resolveComment"), id: z.string(), reply: z.string().max(2000).optional() }).strict(),
  z.object({ op: z.literal("replyComment"), id: z.string(), text: z.string().min(1).max(2000) }).strict(),
]);

export default defineTool({
  description: "Change the layout of a design canvas: move, resize, rename or remove artboards; move one to another page of the canvas (toSheet, by the page's title; made if missing); add, move or remove row titles and stickies; reply to or resolve the person's comments (ids from design-canvas_read). Boards in a row sit 80px apart, rows 120px apart; a row title sits 300px above its row with w = the row width.",
  effect: "read", category: "canvas", title: { en: "Arranged the design canvas", ru: "Разложил дизайн-холст" },
  args: z.object({ tabId: z.string(), ops: z.array(op).min(1).max(60) }).strict(),
  summary: (a) => `${a.ops.length} change(s)`,
  async run(a, api) {
    const b = await loadBoard(api, a.tabId);
    if ("error" in b) return { text: b.error, isError: true };
    const s = b.state;
    s.notes ??= {};
    for (const o of a.ops) {
      if ("file" in o && !s.boards[o.file as string]) return { text: `No artboard ${o.file}. Nothing was changed.`, isError: true };
      if (o.op === "move") Object.assign(s.boards[o.file]!, { x: o.x, y: o.y });
      if (o.op === "resize") Object.assign(s.boards[o.file]!, { w: o.w, h: o.h });
      if (o.op === "rename") s.boards[o.file]!.title = o.title;
      if (o.op === "remove") { delete s.boards[o.file]; delete s.files[o.file]; s.order = s.order.filter((f) => f !== o.file); }
      if (o.op === "note") s.notes[o.id] = { kind: o.kind, text: o.text, x: o.x, y: o.y, ...(o.w ? { w: o.w } : {}) };
      if (o.op === "removeNote") delete s.notes[o.id];
      if (o.op === "toSheet") {
        let list = sheetsOf(s), hit = list.find((p) => p.title.toLowerCase() === o.sheet.toLowerCase() || p.id === o.sheet);
        if (!hit) { s.sheets = list.map((p) => (p.title ? p : { ...p, title: api.t.locale === "ru" ? "Страница 1" : "Page 1" })); hit = { id: `p${Date.now().toString(36)}${s.sheets.length}`, title: o.sheet }; s.sheets.push(hit); list = s.sheets; }
        const b = s.boards[o.file]!;
        Object.assign(b, placeNew(s, b.w, b.h, hit.id));
        if (hit.id === list[0]!.id) delete b.sheet; else b.sheet = hit.id;
      }
    }
    // comments live in the core's store: answered and closed there (they are not edits of the canvas)
    const mine = new Set(((await api.canvas.comments?.(b.id)) ?? []).map((c) => c.id));
    for (const o of a.ops) {
      if (o.op !== "resolveComment" && o.op !== "replyComment") continue;
      if (!mine.has(o.id)) return { text: `No open comment ${o.id} on this canvas.`, isError: true };
      const text = o.op === "replyComment" ? o.text : o.reply;
      if (text) await api.canvas.replyComment?.(o.id, text);
      if (o.op === "resolveComment") await api.canvas.resolveComment?.(o.id);
    }
    const edits = a.ops.filter((o) => o.op !== "resolveComment" && o.op !== "replyComment").length;
    if (edits) await api.canvas.write(b.id, { state: s, note: `layout: ${edits} change(s)` });
    return `Applied ${a.ops.length} change(s).`;
  },
});
