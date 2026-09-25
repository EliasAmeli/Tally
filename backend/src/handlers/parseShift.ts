import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../lib/db";
import { ok, badRequest, getUserId, parseBody } from "../lib/http";

interface ParseInput {
  message: string;
}

interface ProposedShift {
  jobId: string | null;
  jobName: string | null;
  date: string; // YYYY-MM-DD
  start: string;
  end: string;
}

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Matches e.g. "Thu 4-9pm", "Sat 10am-3pm", "wednesday 9:00-17:00"
const SHIFT_PATTERN =
  /(sun|mon|tue|wed|thu|fri|sat)\w*\D{0,12}?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/gi;

/** Next calendar date (>= today) that falls on the given weekday, as YYYY-MM-DD. */
function nextDateForWeekday(weekdayAbbrev: string, from = new Date()): string {
  const targetDow = DAY_NAMES.indexOf(weekdayAbbrev.toLowerCase());
  const d = new Date(from);
  const diff = (targetDow - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Regex-only parser: this is a Phase 1 baseline, not the final approach. Real
 * manager messages are often far less structured than "Day time-time"; the planned
 * upgrade is to fall back to an LLM-based extraction (e.g. via the Claude API) when
 * this pattern doesn't confidently match, and to always return proposals for the
 * user to review/edit rather than saving directly (see docs/ARCHITECTURE.md).
 */
export async function parse(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);

  let input: ParseInput;
  try {
    input = parseBody<ParseInput>(event);
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!input.message?.trim()) return badRequest("`message` is required");

  const jobsResult = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":prefix": "JOB#" },
    }),
  );
  const jobs = (jobsResult.Items ?? []) as { jobId: string; name: string }[];

  const lowerMessage = input.message.toLowerCase();
  const matchedJob = jobs.find((j) => lowerMessage.includes(j.name.toLowerCase().split(" ")[0]));

  const proposals: ProposedShift[] = [];
  let match: RegExpExecArray | null;
  SHIFT_PATTERN.lastIndex = 0;
  while ((match = SHIFT_PATTERN.exec(input.message)) !== null) {
    proposals.push({
      jobId: matchedJob?.jobId ?? null,
      jobName: matchedJob?.name ?? null,
      date: nextDateForWeekday(match[1]),
      start: match[2].trim(),
      end: match[3].trim(),
    });
  }

  if (proposals.length === 0) {
    return ok({
      proposals: [],
      message: "Couldn't find a day + time in that message — try including both, e.g. \"Thu 4-9pm\".",
    });
  }

  return ok({ proposals });
}
