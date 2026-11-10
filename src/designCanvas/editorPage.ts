/**
 * Builds the design canvas editor page: the infinite canvas of artboards (each a sandboxed frame), pages, notes,
 * comments, the properties panel, versions and preview. The page is the plugin's own app in a frame; its script and
 * styles are the plugin's `$script_editor.js` / `$script_editor.css`, served by Hyper at /designCanvas/editor.js|css.
 * @param opts.canvas The canvas.
 * @param opts.csrf CSRF token for the editor's writes; empty on open instances.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas. */
    canvas: types.designCanvas.Canvas;
    /** CSRF token for the editor's writes. */
    csrf: string;
}): Promise<string> {
    const esc = (s: string) => Bun.escapeHTML(s);
    const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
    // the assets named by their content: a page opened after an update gets the new scripts
    const av = Bun.hash((await Promise.all(["$script_editor.js", "$script_editor.css"].map((f) => Bun.file(new URL(`./${f}`, import.meta.url)).text()))).join("\0")).toString(36);
    const state = ctx.fns.designCanvas.clientState({ canvas: opts.canvas });
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.canvas.title)} · Design canvas</title>
<link rel="stylesheet" href="/designCanvas/editor.css?v=${av}">
</head><body>
<div id="dc" class="dc" data-name="${esc(opts.canvas.name)}" data-csrf="${esc(opts.csrf)}"></div>
<script type="application/json" id="dc-state">${json(state)}</script>
<script src="/designCanvas/editor.js?v=${av}"></script>
</body></html>`;
}
