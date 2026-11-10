import { core } from "../../sdk/http.ts";
/**
 * Build prototype / Update prototype: asked of the agent as the person.
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    return core(ctx, session, opts, "prototype");
}
