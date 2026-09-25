import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { ddb, TABLE_NAME } from "../lib/db";
import { ok, badRequest, getUserId, parseBody } from "../lib/http";

interface JobInput {
  name: string;
  hourlyRate: number;
  color?: string;
}

export async function list(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}`,
        ":prefix": "JOB#",
      },
    }),
  );

  return ok({ jobs: result.Items ?? [] });
}

export async function create(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);

  let input: JobInput;
  try {
    input = parseBody<JobInput>(event);
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!input.name || typeof input.hourlyRate !== "number") {
    return badRequest("`name` (string) and `hourlyRate` (number) are required");
  }

  const jobId = randomUUID();
  const item = {
    PK: `USER#${userId}`,
    SK: `JOB#${jobId}`,
    jobId,
    name: input.name,
    hourlyRate: input.hourlyRate,
    color: input.color ?? null,
    createdAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

  return ok({ job: item }, 201);
}
