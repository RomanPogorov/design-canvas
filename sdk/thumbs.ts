// Artboard previews (Speca's design library draws them in its background browser: GET /design/thumb/:tab?q=1&f=…&k=…
// &r=…): a picture of the artboard shown while its live frame sleeps (far away or small on screen). Drawn here in a
// headless Chrome (sdk/shot.ts chromePage, kept open for a while and used by one preview at a time), kept in memory by
// the artboard's render key. While one is being drawn the answer is an empty pixel — the canvas asks again (dcv.js).
import { render } from "../speca/plugins/design-canvas/lib/template.ts";
import { renderKey } from "../speca/plugins/design-canvas/lib/template.ts";
import { sandboxShim } from "../speca/core/web/sandbox.ts";
import { chromePage } from "./shot.ts";
import * as store from "./store.ts";

const PIXEL = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="), (ch) => ch.charCodeAt(0));
const THUMB_W = 480;
type St = { cache: Map<string, Uint8Array>; busy: Set<string>; chain: Promise<unknown>; page: Awaited<ReturnType<typeof chromePage>> | null; idle: ReturnType<typeof setTimeout> | null; failed: number };
const st = (ctx: Context): St => (((ctx.state as any).designCanvas ??= {}).thumbs ??= { cache: new Map(), busy: new Set(), chain: Promise.resolve(), page: null, idle: null, failed: 0 });

async function draw(ctx: Context, s: St, html: string, w: number, h: number, scale: number): Promise<Uint8Array> {
    if (!s.page) s.page = await chromePage(ctx);
    const p = s.page;
    await p.send("Page.enable");
    await p.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: scale, mobile: false });
    const tree = await p.send("Page.getFrameTree");
    await p.send("Page.setDocumentContent", { frameId: tree.frameTree.frame.id, html });
    await Bun.sleep(350);
    const shot = await p.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
    return Uint8Array.from(Buffer.from(shot.data, "base64"));
}

export async function thumb(ctx: Context, tabId: string, req: Request): Promise<Response> {
    const q = new URL(req.url).searchParams, f = q.get("f") ?? "", r = Math.max(0, Math.min(2, Number(q.get("r")) || 0));
    const tab = await store.getTab(ctx, tabId);
    const s0: any = tab?.state, b = s0?.boards?.[f];
    if (!tab || !b || b.pending || s0.files?.[f] === undefined) return new Response("not found", { status: 404 });
    const k = renderKey(f, s0.files);
    const scale = r === 0 ? Math.min(THUMB_W, b.w / 2) / b.w : r === 1 ? Math.min(1920, b.w) / b.w : Math.min(2, 3840 / b.w);
    const key = `${tabId}:${f}:${k}:${r}`, S = st(ctx);
    const png = S.cache.get(key);
    const headers = { "content-type": "image/png", "cache-control": png ? "private, max-age=31536000, immutable" : "no-store" };
    if (png) return new Response(png, { headers });
    if (!S.busy.has(key) && S.failed < 5) {
        S.busy.add(key);
        const html = `<!doctype html><html><head><meta charset="utf-8">${sandboxShim("t")}<style>html,body{margin:0;height:100%;background:#fff}</style></head><body>${render(s0.files[f], s0.files, undefined, { tids: false, depth: 0, seen: new Set() })}</body></html>`;
        S.chain = S.chain.then(async () => {
            try {
                const bytes = await draw(ctx, S, html, Math.round(b.w), Math.min(Math.round(b.h), 6000), scale);
                S.cache.set(key, bytes);
                while (S.cache.size > 300) S.cache.delete(S.cache.keys().next().value!);
            } catch { S.failed++; try { await S.page?.close(); } catch { /* gone */ } S.page = null; }
            finally {
                S.busy.delete(key);
                if (S.idle) clearTimeout(S.idle);
                S.idle = setTimeout(() => { const p = S.page; S.page = null; void p?.close(); }, 120_000);
            }
        });
    }
    return new Response(PIXEL, { headers });
}
