import { core } from "../../sdk/http.ts";
/**
 * Every comment of mine kept for later, to the agent in one message.
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    return core(ctx, session, opts, "comments/send");
}
