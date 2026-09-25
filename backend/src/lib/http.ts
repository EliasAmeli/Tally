import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";

export function ok(body: unknown, statusCode = 200): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function badRequest(message: string): APIGatewayProxyResultV2 {
  return ok({ error: message }, 400);
}

export function notFound(message = "Not found"): APIGatewayProxyResultV2 {
  return ok({ error: message }, 404);
}

/** Pulls the Cognito `sub` claim out of the JWT authorizer context. */
export function getUserId(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  const sub = claims?.sub;
  if (!sub || typeof sub !== "string") {
    throw new Error("Missing sub claim on authorizer context");
  }
  return sub;
}

export function parseBody<T>(event: { body?: string | null }): T {
  if (!event.body) throw new Error("Missing request body");
  return JSON.parse(event.body) as T;
}
