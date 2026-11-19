/**
 * OpenAPI description types (3.0 / 3.1 / 3.2). Kept deliberately loose: unknown fields and
 * `x-` extensions are preserved untouched, so a document imported from another tool round-trips.
 */
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export type Schema = {
  $ref?: string; type?: string | string[]; format?: string; title?: string; description?: string;
  properties?: Record<string, Schema>; required?: string[]; items?: Schema; enum?: unknown[];
  example?: unknown; examples?: unknown[]; default?: unknown; nullable?: boolean;
  oneOf?: Schema[]; anyOf?: Schema[]; allOf?: Schema[]; additionalProperties?: boolean | Schema;
  [k: string]: unknown;
};

export type ParamIn = "query" | "header" | "path" | "cookie";
export type Parameter = { $ref?: string; name: string; in: ParamIn; description?: string; required?: boolean; deprecated?: boolean; schema?: Schema; example?: unknown; [k: string]: unknown };
export type MediaType = { schema?: Schema; example?: unknown; examples?: Record<string, { summary?: string; value?: unknown }>; [k: string]: unknown };
export type RequestBody = { $ref?: string; description?: string; required?: boolean; content: Record<string, MediaType>; [k: string]: unknown };
export type ResponseObj = { $ref?: string; description?: string; content?: Record<string, MediaType>; headers?: Record<string, unknown>; [k: string]: unknown };
export type SecurityRequirement = Record<string, string[]>;

export type Operation = {
  operationId?: string; summary?: string; description?: string; tags?: string[]; deprecated?: boolean;
  parameters?: Parameter[]; requestBody?: RequestBody; responses?: Record<string, ResponseObj>;
  security?: SecurityRequirement[]; servers?: Server[]; [k: string]: unknown;
};

/** `query` is the HTTP QUERY method, an OpenAPI 3.2 feature. */
export const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace", "query"] as const;
export type Method = (typeof METHODS)[number];
export type PathItem = { summary?: string; description?: string; parameters?: Parameter[]; servers?: Server[] } & Partial<Record<Method, Operation>> & { [k: string]: unknown };

export type SecurityScheme = {
  type: "http" | "apiKey" | "oauth2" | "openIdConnect" | "mutualTLS"; description?: string;
  scheme?: string; bearerFormat?: string; name?: string; in?: "query" | "header" | "cookie";
  flows?: Record<string, { authorizationUrl?: string; tokenUrl?: string; scopes?: Record<string, string> }>; openIdConnectUrl?: string;
  [k: string]: unknown;
};

export type Server = { url: string; description?: string; variables?: Record<string, { default: string; enum?: string[]; description?: string }> };
/** `summary`, `parent` and `kind` are OpenAPI 3.2 tag fields. */
export type Tag = { name: string; description?: string; summary?: string; parent?: string; kind?: string; [k: string]: unknown };

export type OpenApiDoc = {
  openapi: string;
  info: { title: string; version: string; summary?: string; description?: string; contact?: { name?: string; email?: string; url?: string }; license?: { name: string; identifier?: string; url?: string }; termsOfService?: string; [k: string]: unknown };
  servers?: Server[]; tags?: Tag[]; paths?: Record<string, PathItem>; security?: SecurityRequirement[];
  components?: { schemas?: Record<string, Schema>; securitySchemes?: Record<string, SecurityScheme>; parameters?: Record<string, Parameter>; responses?: Record<string, ResponseObj>; requestBodies?: Record<string, RequestBody>; [k: string]: unknown };
  [k: string]: unknown;
};

/** One operation, flattened for lists, the reference view and exports. */
export type OpRef = { path: string; method: Method; op: Operation; item: PathItem; key: string };

export type Issue = { level: "error" | "warning" | "tip"; where: string; message: string; key?: string };

/** What a project stores (inside ProjectState.docs.api); saved only with "Save project". */
export type ApiDocState = { spec: OpenApiDoc | null; format: "yaml" | "json"; updatedAt: string | null };
