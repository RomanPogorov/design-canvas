import { defineRoute } from "speca/sdk";
import { FILE, type DesignState } from "./lib/model.ts";
import { boardHtml } from "./lib/export.ts";

// One artboard as a standalone HTML file to download.
export default defineRoute({
  method: "GET",
  path: "export/:tab/:file",
  async handler(_req, params, api) {
    const tab = await api.canvas.view(params.tab!);
    const s = tab?.state as DesignState | undefined;
    if (!tab || tab.kind !== "design-canvas.board" || !FILE.test(params.file!) || !s?.boards[params.file!]) return new Response("not found", { status: 404 });
    const name = s.boards[params.file!]!.title.replace(/[^\p{L}\p{N} _-]+/gu, " ").trim() || "artboard";
    return new Response(boardHtml(s, params.file!), { headers: { "content-type": "text/html; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}.html`, "cache-control": "no-store" } });
  },
});
