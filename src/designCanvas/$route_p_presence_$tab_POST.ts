import def from "../../speca/plugins/design-canvas/presence.route.ts";
import { specaRoute } from "../../sdk/http.ts";
/**
 * This person's cursor and selection on the canvas — Speca's presence.route.ts as is.
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    return specaRoute(ctx, session, opts, def as any);
}
