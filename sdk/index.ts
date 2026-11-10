// "speca/sdk" for the copy of Speca's design-canvas plugin in ../speca: what its files import from Speca's SDK, made
// over Hyper. The pure parts are Speca's own core files, copied verbatim into ../speca/core (html, icons, sandbox,
// merge); define* are identities as in Speca; PluginApi is what api.ts builds for every call (sdk/api.ts).
import { z } from "zod";
export { z };
export { html, raw, esc, join, attrs, isRaw, type Raw } from "../speca/core/web/html.ts";
export { ic } from "../speca/core/web/ui/icons.ts";
export { sandboxAttrs, sandboxCsp, sandboxShim, SANDBOX_FLAGS } from "../speca/core/web/sandbox.ts";
export { mergeState, merge3 } from "../speca/core/util/merge3.ts";
export type { PluginApi, CanvasCtx, ToolOutput } from "./api.ts";

export type RouteDef = { method: "GET" | "POST"; path: string; handler(req: Request, params: Record<string, string>, api: any): Promise<Response | { toString(): string } | string> };
export const defineRoute = <D extends RouteDef>(def: D): D => def;
export type ToolDef = { description: string; effect?: unknown; args: z.ZodTypeAny; title?: unknown; category?: string; summary?(a: any): string; run(a: any, api: any): Promise<any> };
export const defineTool = <D extends ToolDef>(def: D): D => def;
export const defineCanvas = <D extends Record<string, any>>(def: D): D => def;
