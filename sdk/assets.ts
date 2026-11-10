// Files served as they are in Speca: the plugin's client (../speca/plugins/design-canvas/assets), Speca's page styles,
// htmx, basecoat and fonts (../speca/web/assets), and the host glue (./host.js). Text files pass through the seam.
import { seam } from "./seam.ts";

const ROOTS = {
    plugin: new URL("../speca/plugins/design-canvas/assets/", import.meta.url),
    css: new URL("../speca/web/assets/css/", import.meta.url),
    vendor: new URL("../speca/web/assets/vendor/", import.meta.url),
    fonts: new URL("../speca/web/assets/vendor/fonts/", import.meta.url),
    host: new URL("./", import.meta.url),
} as const;
const TYPES: Record<string, string> = { js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", woff2: "font/woff2", svg: "image/svg+xml", html: "text/html; charset=utf-8" };

export async function serve(root: keyof typeof ROOTS, file: string, req: Request): Promise<Response> {
    if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,80}\.(js|css|woff2)$/.test(file) || (root === "host" && file !== "host.js")) return new Response("not found", { status: 404 });
    const f = Bun.file(new URL(file, ROOTS[root]));
    if (!(await f.exists())) return new Response("not found", { status: 404 });
    const ext = file.split(".").pop()!;
    // named by content (?v=…): kept; else asked again each time (a page that keeps running gets new scripts on its next render)
    const cache = new URL(req.url).searchParams.has("v") || ext === "woff2" ? "public, max-age=31536000, immutable" : "no-cache";
    const body = ext === "woff2" ? await f.arrayBuffer() : seam(await f.text());
    return new Response(body, { headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": cache } });
}
