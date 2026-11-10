import def from "../../speca/plugins/design-canvas/presence-list.route.ts";
import { specaRoute } from "../../sdk/http.ts";
/**
 * The others on this design canvas — Speca's presence-list.route.ts as is.
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    return specaRoute(ctx, session, opts, def as any);
}
