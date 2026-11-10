import { defineRoute, z } from "speca/sdk";
import { FILE, type DesignState } from "./lib/model.ts";
import { copyOf } from "./lib/dom.ts";
import { copyBoards } from "./lib/boards-clip.ts";

// Copy (and cut, before its delete): the source of the picked elements of an artboard, as the agent wrote it — the
// canvas keeps it to paste into any artboard the person can edit (edit route, op "paste"). Or whole artboards ({ files }):
// their files, sizes and places with the components they import, to paste on any design canvas (layout, op
// "pasteBoards"). Reading only.
const body = z.union([
  z.object({ file: z.string().regex(FILE), tids: z.array(z.number().int().min(0)).min(1).max(500) }).strict(),
  z.object({ files: z.array(z.string().regex(FILE)).min(1).max(60) }).strict(),
]);

export default defineRoute({
  method: "POST",
  path: "copy/:tab",
  async handler(req, params, api) {
    const p = body.safeParse(await req.json().catch(() => null));
    const tab = await api.canvas.view(params.tab!);
    if (!p.success || !tab || tab.kind !== "design-canvas.board") return new Response("not found", { status: 404 });
    if ("files" in p.data) {
      const r = copyBoards(tab.state as DesignState, p.data.files);
      return "error" in r ? Response.json(r, { status: 404 }) : Response.json(r);
    }
    const src = (tab.state as DesignState).files?.[p.data.file];
    if (src === undefined) return new Response("not found", { status: 404 });
    const r = copyOf(src, p.data.tids);
    return "error" in r ? Response.json(r, { status: 422 }) : Response.json(r);
  },
});
