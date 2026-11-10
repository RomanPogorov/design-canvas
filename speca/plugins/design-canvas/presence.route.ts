import { defineRoute, z } from "speca/sdk";
import { FILE } from "./lib/model.ts";

// Where the others on this design canvas are: their cursor (world px) and selection (an artboard, its rectangles).
// The browser posts its own a few times a second while it moves, and fetches the others on a "presence" signal.
const rect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).strict();
const body = z.object({
  state: z.object({ x: z.number().optional(), y: z.number().optional(), file: z.string().regex(FILE).optional(), rects: z.array(rect).max(20).optional(), label: z.string().max(120).optional() }).strict().nullable(),
}).strict();

export default defineRoute({
  method: "POST",
  path: "presence/:tab",
  async handler(req, params, api) {
    const p = body.safeParse(await req.json().catch(() => null));
    if (!p.success) return new Response("bad request", { status: 400 });
    try { return Response.json({ people: await api.canvas.presence(params.tab!, p.data.state) }); } catch { return new Response("not found", { status: 404 }); }
  },
});
