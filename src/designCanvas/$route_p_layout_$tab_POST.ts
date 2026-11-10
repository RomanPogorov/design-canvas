import def from "../../speca/plugins/design-canvas/layout.route.ts";
import { specaRoute } from "../../sdk/http.ts";
/**
 * The person's change of the canvas layout (move, resize, notes, pages, paste) — Speca's layout.route.ts as is.
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    return specaRoute(ctx, session, opts, def as any);
}
