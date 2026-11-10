import { serve } from "../../sdk/assets.ts";
/**
 * The host glue of the canvas page (sdk/host.js).
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    return serve("host", "host.js", opts.req);
}
