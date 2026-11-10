import { core } from "../../sdk/http.ts";
/**
 * A saved version brought back into the draft, or the draft dropped (Speca /canvas/:tab/restore).
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    return core(ctx, session, opts, "restore");
}
