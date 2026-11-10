import tool from "../../speca/plugins/design-canvas/edit.tool.ts";
import { runTool } from "../../sdk/agent.ts";

/**
 * Changes part of one artboard by replacing exact snippets of its HTML (like editing code): each edit has `old`
 * (exact, unique unless `all`) and `new`; all apply together or none. The way to make every change that is not a full
 * redraw. Speca's design-canvas_edit, as is.
 * @param opts.tabId The design canvas id.
 * @param opts.file Artboard file.
 * @param opts.edits `[{ old, new, all? }]`, 1–60.
 * @param opts.note A short note of what changed.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The design canvas id. */ tabId: string;
    /** Artboard file. */ file: string;
    /** Exact replacements. */ edits: Array<{ old: string; new: string; all?: boolean }>;
    /** What changed. */ note?: string;
}): Promise<{ text: string }> {
    return runTool(ctx, tool, opts as any);
}
