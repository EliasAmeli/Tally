import type { Job, Shift, Proposal, PayrollBreakdown } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "";

// TODO: replace with real Cognito auth (e.g. amazon-cognito-identity-js or Amplify
// Auth). For now this just holds whatever ID token the login flow sets.
let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const listJobs = () => request<{ jobs: Job[] }>("/jobs");

export const createJob = (job: Omit<Job, "jobId">) =>
  request<{ job: Job }>("/jobs", { method: "POST", body: JSON.stringify(job) });

export const listShifts = (range: "today" | "tomorrow" | "week") =>
  request<{ shifts: Shift[] }>(`/shifts?range=${range}`);

export const createShift = (shift: Omit<Shift, "shiftId">) =>
  request<{ shift: Shift }>("/shifts", { method: "POST", body: JSON.stringify(shift) });

export const updateShift = (
  shiftId: string,
  date: string,
  changes: Partial<Pick<Shift, "start" | "end" | "tips">>,
) =>
  request<{ shift: Shift }>(`/shifts/${shiftId}?date=${date}`, {
    method: "PUT",
    body: JSON.stringify({ date, ...changes }),
  });

export const deleteShift = (shiftId: string, date: string) =>
  request<{ deleted: boolean }>(`/shifts/${shiftId}?date=${date}`, { method: "DELETE" });

export const parseMessage = (message: string) =>
  request<{ proposals: Proposal[]; message?: string }>("/parse", {
    method: "POST",
    body: JSON.stringify({ message }),
  });

export const getCurrentPayroll = () => request<PayrollBreakdown>("/payroll/current");
