import { core } from "../../sdk/http.ts";
/**
 * An artboard's preview picture (none in Hyper: an empty one).
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    return core(ctx, session, opts, "thumb");
}
