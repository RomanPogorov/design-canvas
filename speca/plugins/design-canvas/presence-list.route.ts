import { defineRoute } from "speca/sdk";

// The others on this design canvas, read on a "presence" signal (reading announces nothing, so no echo).
export default defineRoute({
  method: "GET",
  path: "presence/:tab",
  async handler(_req, params, api) {
    try { return Response.json({ people: await api.canvas.presence(params.tab!) }); } catch { return new Response("not found", { status: 404 }); }
  },
});
