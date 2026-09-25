import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../lib/db";
import { ok, getUserId } from "../lib/http";
import { calculatePayroll, DEFAULT_PAYROLL_CONFIG, type ShiftHours } from "../lib/payroll";
import { hoursBetween } from "../lib/time";

const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

function weekRange(from = new Date()): [string, string] {
  const day = from.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(from);
  monday.setDate(from.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [toDateStr(monday), toDateStr(sunday)];
}

/**
 * Phase 1 treats "current period" as the current week. Real pay periods (biweekly,
 * semi-monthly, tied to a specific employer's schedule) should replace this once
 * that's a product decision — the payroll math itself doesn't care about the window.
 */
export async function current(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const pk = `USER#${userId}`;
  const [start, end] = weekRange();

  const [jobsResult, shiftsResult] = await Promise.all([
    ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: { ":pk": pk, ":prefix": "JOB#" },
      }),
    ),
    ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND SK BETWEEN :start AND :end",
        ExpressionAttributeValues: {
          ":pk": pk,
          ":start": `SHIFT#${start}`,
          ":end": `SHIFT#${end}~`,
        },
      }),
    ),
  ]);

  const rateByJobId = new Map<string, number>(
    (jobsResult.Items ?? []).map((j) => [j.jobId as string, j.hourlyRate as number]),
  );

  const shiftHours: ShiftHours[] = (shiftsResult.Items ?? []).map((s) => ({
    date: s.date as string,
    hourlyRate: rateByJobId.get(s.jobId as string) ?? 0,
    hoursWorked: hoursBetween(s.start as string, s.end as string),
    tips: (s.tips as number) ?? 0,
  }));

  const breakdown = calculatePayroll(shiftHours, DEFAULT_PAYROLL_CONFIG);

  return ok({
    period: { start, end },
    ...breakdown,
    note: "Deduction rates are placeholders — see docs/ARCHITECTURE.md before relying on these numbers.",
  });
}
