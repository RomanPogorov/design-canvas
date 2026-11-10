import { core } from "../../sdk/http.ts";
/**
 * The comments of the canvas (?all=1 with the resolved ones).
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    return core(ctx, session, opts, "comments");
}
