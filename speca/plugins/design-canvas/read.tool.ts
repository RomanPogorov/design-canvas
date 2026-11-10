import { defineTool, z } from "speca/sdk";
import { FILE, outline, sheetOf, sheetsOf } from "./lib/model.ts";
import { loadBoard } from "./lib/tools.ts";

export default defineTool({
  description: "Read a design canvas: without `file` — the index (artboards with titles, sizes and positions, row titles, open comments with the element they are pinned to); with `file` — that artboard's HTML and an outline of its elements with tids, to resolve an address like \"Main.html#12:0/1/3\" (tid 12) the person points at.",
  effect: "read", category: "canvas", title: { en: "Looked at the design canvas", ru: "Посмотрел дизайн-холст" },
  args: z.object({ tabId: z.string(), file: z.string().regex(FILE).optional() }).strict(),
  async run(a, api) {
    const b = await loadBoard(api, a.tabId);
    if ("error" in b) return { text: b.error, isError: true };
    const s = b.state;
    if (!a.file) {
      const notes = Object.entries(s.notes ?? {}).map(([id, n]) => `- note ${id} (${n.kind}) "${n.text.slice(0, 60)}" at ${n.x},${n.y}`);
      // the comments: the core's store, one for every canvas (anchor.path is the artboard address)
      const comments = ((await api.canvas.comments?.(b.id)) ?? []).map((c) => `- comment ${c.id} on [${c.label}](${c.anchor.path}) by ${c.authorName}: "${c.body.slice(0, 400)}"${c.replies.map((r) => `\n    ↳ ${r.name}: "${r.text.slice(0, 200)}"`).join("")}`);
      // several pages: each artboard says which (the first page goes unsaid)
      const pages = sheetsOf(s), many = pages.length > 1, pageOf = (x: { sheet?: string }) => pages.find((p) => p.id === sheetOf(s, x))!;
      return `Design canvas "${s.title ?? ""}" (${b.id})${many ? `\nPages: ${pages.map((p) => `"${p.title}"`).join(", ")}` : ""}\nArtboards:\n${s.order.filter((f) => s.boards[f]).map((f) => { const x = s.boards[f]!; return `- ${f} · "${x.title}" · ${x.w}×${x.h}${x.page ? " page" : ""} at ${x.x},${x.y}${many ? ` · on page "${pageOf(x).title}"` : ""}${x.pending ? " · waiting to be drawn (design-canvas_write)" : ""}`; }).join("\n")}${notes.length ? `\nNotes:\n${notes.join("\n")}` : ""}${comments.length ? `\nOpen comments:\n${comments.join("\n")}` : ""}`;
    }
    const html = s.files[a.file];
    if (html === undefined) return { text: s.boards[a.file]?.pending ? `${a.file} is planned but not drawn yet: draw it with design-canvas_write.` : `No artboard ${a.file}.`, isError: true };
    return `${a.file} — "${s.boards[a.file]?.title}"\n\nOutline (#tid tag "text"):\n${await outline(html)}\n\nHTML:\n${html.slice(0, 60_000)}`;
  },
});
