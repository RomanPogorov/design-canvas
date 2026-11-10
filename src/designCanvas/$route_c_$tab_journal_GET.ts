import { core } from "../../sdk/http.ts";
/**
 * The journal of the draft's edits and the saved versions.
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    return core(ctx, session, opts, "journal");
}
