import * as store from "../../sdk/store.ts";
import { makeApi } from "../../sdk/api.ts";
import { agentWho } from "../../sdk/agent.ts";

/**
 * Shows a design canvas to the person (its canvas tab comes to the front), optionally bringing one artboard into view
 * — by its file or title, on its page. Speca's canvas_show with focus.
 * @param opts.tabId The design canvas id.
 * @param opts.focus An artboard: its file ("02-sign-in.html") or title.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** The design canvas id. */ tabId: string;
    /** An artboard by file or title. */ focus?: string;
}): Promise<{ shown: true }> {
    if (!(await store.getTab(ctx, String(opts.tabId ?? "")))) throw new Error(`designCanvas.show: no design canvas "${opts.tabId}"`);
    await makeApi(ctx, await agentWho(ctx)).canvas.show(opts.tabId, opts.focus ? { focus: opts.focus } : undefined);
    return { shown: true };
}
