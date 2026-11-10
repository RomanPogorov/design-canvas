import { defineRoute } from "speca/sdk";
import type { DesignState } from "./lib/model.ts";
import { allHtml } from "./lib/export.ts";

// All artboards of a design canvas as one HTML page to download (print it to PDF for a deck).
export default defineRoute({
  method: "GET",
  path: "export/:tab",
  async handler(_req, params, api) {
    const tab = await api.canvas.view(params.tab!);
    if (!tab || tab.kind !== "design-canvas.board") return new Response("not found", { status: 404 });
    const s = tab.state as DesignState;
    const name = (s.title || tab.title || "design").replace(/[^\p{L}\p{N} _-]+/gu, " ").trim() || "design";
    return new Response(allHtml(s), { headers: { "content-type": "text/html; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}.html`, "cache-control": "no-store" } });
  },
});
