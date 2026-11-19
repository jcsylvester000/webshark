import "server-only";
export type CommandCtx = { userId: string; sessionHash: string };
export type Payload = Record<string, unknown>;
export type Handler = (ctx: CommandCtx, p: Payload) => Promise<Record<string, unknown>>;
