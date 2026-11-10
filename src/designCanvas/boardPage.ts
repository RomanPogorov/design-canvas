// The base styles every artboard frame gets: no margins, the root fills the artboard (the layout is fluid — the
// person resizes artboards by their edges), the system font.
const BASE = `html,body{margin:0}html,body{height:100%}body>:is(div,section,main,article,header,footer,aside,nav,form){width:100%!important;max-width:100%!important;box-sizing:border-box}body:not(:has(>:is(div,section,main,article,header,footer,aside,nav,form)~:is(div,section,main,article,header,footer,aside,nav,form)))>:is(div,section,main,article,header,footer,aside,nav,form){height:100%!important}body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}`;
const EDITING = `body{user-select:none;-webkit-user-select:none}[contenteditable]{outline:none;cursor:text;user-select:text;-webkit-user-select:text}*{cursor:default}`;

/**
 * Builds the whole HTML document of one artboard as a frame shows it: the file rendered (data, repeats, branches,
 * components), base styles and — for the editor — the in-frame picker with every element marked by its tid.
 *
 * Use for the artboard route, screenshots and previews. `mode`: edit (picker, data-tid marks), play (links to
 * other artboards navigate; for Preview) or static (clean HTML, no editor script; for screenshots and exports).
 * @param opts.canvas The canvas.
 * @param opts.file The artboard file.
 * @param opts.mode edit, play or static. @default "edit"
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The canvas. */
    canvas: types.designCanvas.Canvas;
    /** The artboard file. */
    file: string;
    /** edit, play or static. @default "edit" */
    mode?: "edit" | "play" | "static";
}): Promise<string | null> {
    const src = opts.canvas.files[opts.file];
    if (src === undefined) return null;
    const mode = opts.mode ?? "edit";
    const body = ctx.fns.designCanvas.render({ src, files: opts.canvas.files, tids: mode !== "static" });
    const picker = mode === "static" ? "" : `<script>${(await Bun.file(new URL("./$script_picker.js", import.meta.url)).text()).replace(/<\/script/gi, "<\\/script")}</script>`;
    const title = Bun.escapeHTML(opts.canvas.boards[opts.file]?.title ?? opts.file);
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${BASE}${mode === "edit" ? EDITING : ""}</style></head><body>${body}${picker}</body></html>`;
}
