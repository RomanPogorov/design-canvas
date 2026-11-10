import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * Photographs a design canvas as the person sees it: one page of the canvas whole (artboards, titles, stickies),
 * one artboard at full size, or one element of it (`tid`). Saves a PNG and returns its path.
 *
 * Use to check what you drew before saying it is done, and whenever the person asks how something looks. Needs the
 * Browser plugin (Hyper's headless Chrome through `cdp.send`); without it this throws and says so. The page is
 * drawn straight into a blank tab (no sign-in needed), so it works on any instance.
 * @param opts.name The canvas name.
 * @param opts.file One artboard; omit for a whole page of the canvas.
 * @param opts.tid With `file`: only this element (its tid from designCanvas.read).
 * @param opts.sheet Without `file`: the page, by title or id; default: the first page.
 * @param opts.version A saved version instead of the current canvas.
 * @param opts.path Where to write the PNG; default: `<canvas folder>/.shots/<file or page>-<time>.png`.
 * @param opts.settleMs Wait for pictures and fonts before the shot, ms. @default 600
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas name. */
    name: string;
    /** One artboard; omit for a whole page. */
    file?: string;
    /** With `file`: only this element. */
    tid?: number;
    /** Without `file`: the page, by title or id. */
    sheet?: string;
    /** A saved version instead of the current canvas. */
    version?: number;
    /** Where to write the PNG. */
    path?: string;
    /** Wait before the shot, ms. @default 600 */
    settleMs?: number;
}): Promise<{ path: string; width: number; height: number }> {
    const cdp = (ctx.fns as any).cdp;
    if (!cdp?.send) throw new Error("designCanvas.screenshot needs the Browser plugin (cdp.send) — install or activate it, or look at the canvas tab yourself");
    const c = opts.version ? (await ctx.fns.designCanvas.version({ name: opts.name, version: opts.version })).canvas : await ctx.fns.designCanvas.load({ name: opts.name });
    if (!c) throw new Error(`designCanvas.screenshot: no canvas "${opts.name}"`);
    let html: string, width: number, height: number, label: string;
    if (opts.file) {
        const b = c.boards[opts.file];
        if (!b || b.pending || c.files[opts.file] === undefined) throw new Error(`designCanvas.screenshot: ${opts.file} is not a drawn artboard`);
        // with a tid the frame keeps its data-tid marks (play mode: no editor rings), so the element can be found
        html = (await ctx.fns.designCanvas.boardPage({ canvas: c, file: opts.file, mode: opts.tid !== undefined ? "play" : "static" }))!;
        width = b.w; height = b.h; label = opts.file.replace(/\.html$/, "");
    } else {
        const sheets = c.sheets.length ? c.sheets : [{ id: "main", title: "" }];
        const sheet = opts.sheet ? sheets.find((p) => p.id === opts.sheet || p.title.toLowerCase() === opts.sheet!.toLowerCase())?.id : undefined;
        if (opts.sheet && !sheet) throw new Error(`designCanvas.screenshot: no page "${opts.sheet}"`);
        ({ html, width, height } = await ctx.fns.designCanvas.overviewHtml({ canvas: c, sheet }));
        label = `page-${sheet ?? sheets[0]!.id}`;
    }
    height = Math.min(height, 12000);
    const session = "design-canvas";
    await cdp.send({ session, method: "Page.enable" });
    await cdp.send({ session, method: "Emulation.setDeviceMetricsOverride", params: { width, height, deviceScaleFactor: 1, mobile: false } });
    await cdp.send({ session, method: "Page.navigate", params: { url: "about:blank" } });
    await Bun.sleep(150);
    const tree = await cdp.send({ session, method: "Page.getFrameTree" });
    await cdp.send({ session, method: "Page.setDocumentContent", params: { frameId: tree.frameTree.frame.id, html } });
    await Bun.sleep(Math.max(0, Math.min(10_000, opts.settleMs ?? 600)));
    let clip: Record<string, number> | undefined;
    if (opts.file && opts.tid !== undefined) {
        const r = await cdp.send({ session, method: "Runtime.evaluate", params: { returnByValue: true,
            expression: `(() => { const e = document.querySelector('[data-tid="${Math.floor(Number(opts.tid))}"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: Math.max(1, r.width), height: Math.max(1, r.height) }; })()` } });
        if (!r?.result?.value) throw new Error(`designCanvas.screenshot: no element #${opts.tid} in ${opts.file}`);
        clip = { ...r.result.value, scale: 1 };
    }
    const shot = await cdp.send({ session, method: "Page.captureScreenshot", params: { format: "png", captureBeyondViewport: true, ...(clip ? { clip } : {}) } });
    await cdp.send({ session, method: "Emulation.clearDeviceMetricsOverride" }).catch(() => {});
    if (!shot?.data) throw new Error("designCanvas.screenshot: Chrome returned no image");
    const p = await ctx.fns.designCanvas.paths({ name: c.name });
    const path = opts.path ? resolve(ctx.fns.procs.project.projectRoot({}), opts.path) : join(p.dir, ".shots", `${label}${opts.tid !== undefined ? `-${opts.tid}` : ""}-${Date.now()}.png`);
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, Buffer.from(shot.data, "base64"));
    return { path, width: clip ? Math.round(clip.width!) : width, height: clip ? Math.round(clip.height!) : height };
}
