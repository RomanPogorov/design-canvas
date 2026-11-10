import { resolve } from "node:path";
import { homedir } from "node:os";

/**
 * Returns the absolute directory that holds the design canvases (one folder each).
 *
 * Resolves the `designCanvas.root` setting: relative paths against the project root, `~/` against the home
 * directory. Every canvas path is confined to it.
 */
export default async function (ctx: Context, _session: Session | null, _opts: {} = {}): Promise<string> {
    const configured = String(await ctx.fns.settings.getString({ module: "designCanvas", scopeType: "global", key: "root", fallback: "designs" }) ?? "").trim() || "designs";
    if (configured.startsWith("~/")) return resolve(homedir(), configured.slice(2));
    return resolve(ctx.fns.procs.project.projectRoot({}), configured);
}
