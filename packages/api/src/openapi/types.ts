/**
 * Minimal OpenAPI 3.1 type subset — just the corners the hand-written
 * spec.ts touches. Hand-rolled rather than depending on `openapi3-ts`
 * to keep the slice dependency-free. Mirror of the monorepo's
 * packages/api/src/openapi/types.ts so the two specs share authoring
 * vocabulary across the federated surface.
 *
 * Reference: https://spec.openapis.org/oas/v3.1.0
 */

export interface OpenAPIObject {
  openapi: "3.1.0";
  info: InfoObject;
  servers: ServerObject[];
  tags: TagObject[];
  components: ComponentsObject;
  paths: PathsObject;
}

export interface InfoObject {
  title: string;
  version: string;
  description?: string;
  contact?: { name?: string; email?: string; url?: string };
  license?: { name: string; url?: string; identifier?: string };
}

export interface ServerObject {
  url: string;
  description?: string;
}

export interface TagObject {
  name: string;
  description?: string;
}

export interface ComponentsObject {
  securitySchemes: Record<string, SecuritySchemeObject>;
  schemas?: Record<string, SchemaObject>;
}

export type SecuritySchemeObject =
  | {
      type: "http";
      scheme: "bearer";
      bearerFormat?: string;
      description?: string;
    }
  | {
      type: "apiKey";
      in: "header" | "query" | "cookie";
      name: string;
      description?: string;
    };

export type PathsObject = Record<string, PathItemObject>;

export interface PathItemObject {
  summary?: string;
  description?: string;
  get?: OperationObject;
  put?: OperationObject;
  post?: OperationObject;
  delete?: OperationObject;
  patch?: OperationObject;
}

export interface OperationObject {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  deprecated?: boolean;
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses: ResponsesObject;
  security?: SecurityRequirementObject[];
}

export interface ParameterObject {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
  example?: unknown;
}

export interface RequestBodyObject {
  required?: boolean;
  description?: string;
  content: Record<string, MediaTypeObject>;
}

export interface MediaTypeObject {
  schema?: SchemaObject;
  example?: unknown;
  examples?: Record<string, { value: unknown; summary?: string }>;
}

export type ResponsesObject = Record<string, ResponseObject>;

export interface ResponseObject {
  description: string;
  content?: Record<string, MediaTypeObject>;
  headers?: Record<string, { description?: string; schema?: SchemaObject }>;
}

export type SecurityRequirementObject = Record<string, string[]>;

export interface SchemaObject {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
  format?: string;
  description?: string;
  enum?: readonly unknown[];
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
  required?: readonly string[];
  additionalProperties?: boolean | SchemaObject;
  nullable?: boolean;
  example?: unknown;
  minimum?: number;
  maximum?: number;
  pattern?: string;
}
