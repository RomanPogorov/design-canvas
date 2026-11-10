// designCanvas.screenshot (Speca's canvas_screenshot for a design canvas): an artboard at full size ("Main.html"), one
// element of it ("Main.html#12") or a page of the canvas whole — drawn straight into a headless Chrome page, so no
// sign-in is needed. Chrome: one of this machine started for the shot (CHROME_PATH, or Google Chrome / Chromium in the
// usual places), else the Browser plugin's (cdp.send).
import { existsSync } from "node:fs";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { render } from "../speca/plugins/design-canvas/lib/template.ts";
import { sheetsOf, sheetOf } from "../speca/plugins/design-canvas/lib/model.ts";
import { sandboxShim } from "../speca/core/web/sandbox.ts";
import * as store from "./store.ts";

type Send = (method: string, params?: Record<string, unknown>) => Promise<any>;

const CHROMES = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean) as string[];

/** A Chrome page to draw into: the Browser plugin's session, or a headless Chrome of this machine for this call. */
export async function chromePage(ctx: Context): Promise<{ send: Send; close: () => Promise<void> }> {
    const bin = CHROMES.find((p) => existsSync(p));
    const cdp = (ctx.fns as any).cdp;
    if (!bin && cdp?.send) {
        const session = "design-canvas";
        return { send: (method, params) => cdp.send({ session, method, params }), close: async () => {} };
    }
    if (!bin) throw new Error("designCanvas.screenshot needs Chrome: Chrome/Chromium on this machine (CHROME_PATH), or the Browser plugin");
    const dir = await mkdtemp(join(tmpdir(), "dc-shot-"));
    const proc = Bun.spawn([bin, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--use-mock-keychain", "--password-store=basic", `--user-data-dir=${dir}`, "--remote-debugging-port=0", "about:blank"], { stdout: "ignore", stderr: "pipe" });
    const reader = proc.stderr.getReader();
    let buf = "", ws = "";
    const until = Date.now() + 15_000;
    while (!ws && Date.now() < until) { const { value, done } = await reader.read(); if (done) break; buf += new TextDecoder().decode(value); ws = /DevTools listening on (ws:\/\/\S+)/.exec(buf)?.[1] ?? ""; }
    if (!ws) { proc.kill(); throw new Error("designCanvas.screenshot: Chrome did not start"); }
    const sock = new WebSocket(ws);
    await new Promise((ok, no) => { sock.onopen = ok; sock.onerror = no; });
    let seq = 0;
    const wait = new Map<number, (m: any) => void>();
    sock.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.id && wait.has(m.id)) { wait.get(m.id)!(m); wait.delete(m.id); } };
    const raw = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => new Promise<any>((ok, no) => {
        const id = ++seq; wait.set(id, (m) => (m.error ? no(new Error(`${method}: ${m.error.message}`)) : ok(m.result)));
        sock.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await raw("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await raw("Target.attachToTarget", { targetId, flatten: true });
    return {
        send: (method, params) => raw(method, params ?? {}, sessionId),
        close: async () => { try { sock.close(); } catch { /* gone */ } proc.kill(); await proc.exited.catch(() => {}); await rm(dir, { recursive: true, force: true }).catch(() => {}); },
    };
}

const esc = (s: string) => Bun.escapeHTML(s);
/** An artboard as its own page (the file rendered — repeats, data, components — at its size). */
const boardDoc = (s: any, f: string) => `<!doctype html><html><head><meta charset="utf-8">${sandboxShim("x")}<style>html,body{margin:0;height:100%}</style></head><body>${render(s.files[f] ?? "", s.files)}</body></html>`;

export async function screenshot(ctx: Context, o: { tabId: string; part?: string; sheet?: string; version?: number; path?: string; settleMs?: number }): Promise<{ path: string; width: number; height: number }> {
    const tab = await store.getTab(ctx, o.tabId);
    if (!tab) throw new Error(`designCanvas.screenshot: no design canvas "${o.tabId}"`);
    const s: any = o.version ? await store.stateAt(ctx, tab.id, { v: o.version }) : tab.state;
    if (!s) throw new Error(`designCanvas.screenshot: no version ${o.version}`);
    let html: string, width: number, height: number, label: string, tid: number | undefined;
    const m = o.part ? /^([A-Za-z0-9_][A-Za-z0-9_.-]*\.html)(?:#(\d+)(?::[\d/]*)?)?$/.exec(o.part.trim()) : null;
    if (o.part && !m) throw new Error(`designCanvas.screenshot: part is "File.html" or "File.html#tid"`);
    if (m) {
        const b = s.boards[m[1]!];
        if (!b || b.pending || s.files[m[1]!] === undefined) throw new Error(`designCanvas.screenshot: ${m[1]} is not a drawn artboard`);
        html = boardDoc(s, m[1]!); width = b.w; height = b.h; label = m[1]!.replace(/\.html$/, ""); tid = m[2] ? Number(m[2]) : undefined;
    } else {
        const pages = sheetsOf(s);
        const sheet = o.sheet ? pages.find((p) => p.id === o.sheet || p.title.toLowerCase() === o.sheet!.toLowerCase())?.id : pages[0]!.id;
        if (!sheet) throw new Error(`designCanvas.screenshot: no page "${o.sheet}"`);
        const files = s.order.filter((f: string) => s.boards[f] && sheetOf(s, s.boards[f]) === sheet);
        const notes = Object.entries(s.notes ?? {}).filter(([, n]: any) => sheetOf(s, n) === sheet) as Array<[string, any]>;
        const xs = [...files.map((f: string) => s.boards[f].x), ...notes.map(([, n]) => n.x)], ys = [...files.map((f: string) => s.boards[f].y - 40), ...notes.map(([, n]) => n.y)];
        const x0 = Math.min(0, ...xs) - 60, y0 = Math.min(0, ...ys) - 60;
        const x1 = Math.max(400, ...files.map((f: string) => s.boards[f].x + s.boards[f].w), ...notes.map(([, n]) => n.x + (n.w ?? 240))) + 60;
        const y1 = Math.max(300, ...files.map((f: string) => s.boards[f].y + s.boards[f].h), ...notes.map(([, n]) => n.y + 80)) + 60;
        width = Math.min(12000, x1 - x0); height = Math.min(12000, y1 - y0);
        html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#f4f4f5;font:13px system-ui,sans-serif;position:relative;width:${width}px;height:${height}px}.b{position:absolute;background:#fff;box-shadow:0 0 0 1px #e4e4e7}.b iframe{border:0;display:block}.t{position:absolute;color:#52525b;font-size:13px;white-space:nowrap}.n{position:absolute;padding:10px 12px;border-radius:6px}.n.title{font-size:44px;font-weight:600;color:#18181b}.n.sticky{background:#fef08a;width:220px}.w{position:absolute;display:grid;place-items:center;border:2px dashed #d4d4d8;color:#71717a}</style></head><body>
${notes.map(([, n]) => `<div class="n ${n.kind}" style="left:${n.x - x0}px;top:${n.y - y0}px;${n.w && n.kind !== "title" ? `width:${n.w}px` : ""}">${esc(n.text)}</div>`).join("")}
${files.map((f: string) => { const b = s.boards[f]; const L = b.x - x0, T = b.y - y0; return `<div class="t" style="left:${L}px;top:${T - 24}px">${esc(b.title)}</div>${b.pending || s.files[f] === undefined ? `<div class="w" style="left:${L}px;top:${T}px;width:${b.w}px;height:${b.h}px">${esc(b.title)}</div>` : `<div class="b" style="left:${L}px;top:${T}px;width:${b.w}px;height:${b.h}px"><iframe width="${b.w}" height="${b.h}" srcdoc="${esc(boardDoc(s, f))}"></iframe></div>`}`; }).join("")}
</body></html>`;
        label = `page-${sheet}`;
    }
    const page = await chromePage(ctx);
    try {
        await page.send("Page.enable");
        await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
        await page.send("Page.navigate", { url: "about:blank" });
        await Bun.sleep(150);
        const tree = await page.send("Page.getFrameTree");
        await page.send("Page.setDocumentContent", { frameId: tree.frameTree.frame.id, html });
        await Bun.sleep(Math.max(0, Math.min(10_000, o.settleMs ?? 800)));
        let clip: Record<string, number> | undefined;
        if (tid !== undefined) {
            // the element by its tid: the rendered file carries data-tid on every element
            const r = await page.send("Runtime.evaluate", { returnByValue: true, expression: `(() => { const e = document.querySelector('[data-tid="${tid}"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: Math.max(1, r.width), height: Math.max(1, r.height) }; })()` });
            if (!r?.result?.value) throw new Error(`designCanvas.screenshot: no element #${tid} in ${label}.html`);
            clip = { ...r.result.value, scale: 1 };
        }
        const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, ...(clip ? { clip } : {}) });
        if (!shot?.data) throw new Error("designCanvas.screenshot: Chrome returned no image");
        const path = o.path ?? join(tmpdir(), "design-canvas-shots", tab.id, `${label}${tid !== undefined ? `-${tid}` : ""}-${Date.now()}.png`);
        await mkdir(dirname(path), { recursive: true });
        await Bun.write(path, Buffer.from(shot.data, "base64"));
        return { path, width: clip ? Math.round(clip.width!) : width, height: clip ? Math.round(clip.height!) : height };
    } finally { await page.close(); }
}
