import { serve } from "../../sdk/assets.ts";
/**
 * Speca's page styles and vendored libraries (app.css, product.css, basecoat, htmx).
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const d = opts.params.dir; return d === "css" || d === "vendor" ? serve(d, opts.params.file ?? "", opts.req) : new Response("not found", { status: 404 });
}
