export interface Job {
  jobId: string;
  name: string;
  hourlyRate: number;
  color?: string | null;
}

export interface Shift {
  shiftId: string;
  jobId: string;
  date: string; // YYYY-MM-DD
  start: string;
  end: string;
  tips: number;
}

export interface Proposal {
  jobId: string | null;
  jobName: string | null;
  date: string;
  start: string;
  end: string;
}

export interface PayrollBreakdown {
  period: { start: string; end: string };
  regularHours: number;
  overtimeHours: number;
  grossWages: number;
  grossTips: number;
  gross: number;
  deductions: {
    cpp: number;
    ei: number;
    federalTax: number;
    provincialTax: number;
    total: number;
  };
  net: number;
}
