import tool from "../../speca/plugins/design-canvas/layout.tool.ts";
import { runTool } from "../../sdk/agent.ts";

/**
 * Changes the layout of a design canvas: move, resize, rename or remove artboards; move one to another page of the
 * canvas (toSheet); add, move or remove row titles and stickies (note / removeNote); reply to or resolve the person's
 * comments (replyComment / resolveComment, ids from designCanvas.read). Speca's design-canvas_layout, as is.
 * @param opts.tabId The design canvas id.
 * @param opts.ops Operations: `{op:"move",file,x,y}`, `{op:"resize",file,w,h}`, `{op:"rename",file,title}`, `{op:"remove",file}`, `{op:"toSheet",file,sheet}`, `{op:"note",id,kind:"title"|"sticky",text,x,y,w?}`, `{op:"removeNote",id}`, `{op:"resolveComment",id,reply?}`, `{op:"replyComment",id,text}`.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The design canvas id. */ tabId: string;
    /** Layout operations. */ ops: Array<Record<string, unknown>>;
}): Promise<{ text: string }> {
    return runTool(ctx, tool, opts as any);
}
