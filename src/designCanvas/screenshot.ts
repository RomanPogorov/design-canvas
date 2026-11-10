import { screenshot } from "../../sdk/shot.ts";

/**
 * Photographs a design canvas to check what you drew before saying it is done, and whenever the person asks how
 * something looks: without `part` a page of the canvas whole (artboards with titles, row titles, stickies); `part`
 * "Main.html" one artboard at full size, "Main.html#12" one element of it (its tid). Saves a PNG and returns its path
 * (look at it). Uses this machine's Chrome (CHROME_PATH), else the Browser plugin's. Speca's canvas_screenshot.
 * @param opts.tabId The design canvas id.
 * @param opts.part "File.html" or "File.html#tid".
 * @param opts.sheet Without `part`: the canvas page, by title; default the first.
 * @param opts.version A saved version instead of the draft.
 * @param opts.path Where to write the PNG; default a temp folder.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The design canvas id. */ tabId: string;
    /** "File.html" or "File.html#tid". */ part?: string;
    /** The canvas page, by title. */ sheet?: string;
    /** A saved version. */ version?: number;
    /** Where to write the PNG. */ path?: string;
}): Promise<{ path: string; width: number; height: number }> {
    return screenshot(ctx, opts);
}
