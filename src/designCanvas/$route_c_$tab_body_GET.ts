import { core } from "../../sdk/http.ts";
/**
 * The tab body: the draft, a version (?v), a moment of the draft (?at) or a comparison (?compare).
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    return core(ctx, session, opts, "body");
}
