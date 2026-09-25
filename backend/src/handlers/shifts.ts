import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { PutCommand, QueryCommand, UpdateCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { ddb, TABLE_NAME } from "../lib/db";
import { ok, badRequest, notFound, getUserId, parseBody } from "../lib/http";

interface ShiftInput {
  jobId: string;
  date: string; // YYYY-MM-DD
  start: string; // e.g. "9:00am"
  end: string; // e.g. "5:00pm"
  tips?: number;
}

type ShiftUpdate = Partial<ShiftInput>;

const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

function weekRange(from = new Date()): [string, string] {
  const day = from.getDay(); // 0 = Sunday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(from);
  monday.setDate(from.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [toDateStr(monday), toDateStr(sunday)];
}

export async function list(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const range = event.queryStringParameters?.range ?? "week";

  const now = new Date();
  let keyCondition: string;
  const values: Record<string, string> = { ":pk": `USER#${userId}` };

  if (range === "today" || range === "tomorrow") {
    const target = new Date(now);
    if (range === "tomorrow") target.setDate(now.getDate() + 1);
    values[":sk"] = `SHIFT#${toDateStr(target)}`;
    keyCondition = "PK = :pk AND begins_with(SK, :sk)";
  } else {
    const [start, end] = weekRange(now);
    values[":start"] = `SHIFT#${start}`;
    values[":end"] = `SHIFT#${end}~`; // '~' sorts after any shiftId suffix for that date
    keyCondition = "PK = :pk AND SK BETWEEN :start AND :end";
  }

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: values,
    }),
  );

  return ok({ shifts: result.Items ?? [] });
}

export async function create(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);

  let input: ShiftInput;
  try {
    input = parseBody<ShiftInput>(event);
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!input.jobId || !input.date || !input.start || !input.end) {
    return badRequest("`jobId`, `date`, `start`, and `end` are required");
  }

  const shiftId = randomUUID();
  const item = {
    PK: `USER#${userId}`,
    SK: `SHIFT#${input.date}#${shiftId}`,
    shiftId,
    jobId: input.jobId,
    date: input.date,
    start: input.start,
    end: input.end,
    tips: input.tips ?? 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

  return ok({ shift: item }, 201);
}

/**
 * Direct edit — Phase 1 has no manager, so the person who owns the shift can just
 * change it (e.g. "stayed an hour later than planned"). Once Phase 3/4 introduces a
 * manager, this should become a request that needs approval instead of a direct write.
 */
export async function update(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const shiftId = event.pathParameters?.id;
  if (!shiftId) return badRequest("Missing shift id in path");

  let input: ShiftUpdate;
  try {
    input = parseBody<ShiftUpdate>(event);
  } catch {
    return badRequest("Invalid JSON body");
  }

  // The SK includes the date, so we need the current item first to build the key.
  // In Phase 1 the client should pass the shift's current `date` so we can look it
  // up directly; falling back to a query keeps this endpoint usable even if it doesn't.
  const date = input.date ?? event.queryStringParameters?.date;
  if (!date) return badRequest("Pass the shift's `date` (body or ?date=) to locate it");

  const pk = `USER#${userId}`;
  const sk = `SHIFT#${date}#${shiftId}`;

  const existing = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: pk, SK: sk } }));
  if (!existing.Item) return notFound("Shift not found");

  const updateExpr: string[] = ["updatedAt = :now"];
  const values: Record<string, unknown> = { ":now": new Date().toISOString() };

  for (const field of ["start", "end", "tips"] as const) {
    if (input[field] !== undefined) {
      updateExpr.push(`${field} = :${field}`);
      values[`:${field}`] = input[field];
    }
  }

  const result = await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: sk },
      UpdateExpression: `SET ${updateExpr.join(", ")}`,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );

  return ok({ shift: result.Attributes });
}

export async function remove(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const shiftId = event.pathParameters?.id;
  const date = event.queryStringParameters?.date;
  if (!shiftId || !date) return badRequest("Need shift id (path) and ?date= to locate it");

  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `SHIFT#${date}#${shiftId}` },
    }),
  );

  return ok({ deleted: true });
}
