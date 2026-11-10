import { core } from "../../sdk/http.ts";
/**
 * A comment's thread: reply, resolve, remove, send to the agent.
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    return core(ctx, session, opts, `cm:${opts.params.what}`);
}
