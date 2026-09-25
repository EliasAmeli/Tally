/**
 * Payroll math. The RATE NUMBERS below are illustrative placeholders only — they are
 * NOT verified against current CRA/BC figures. Before this is used for anything real:
 *   1. Replace `DEFAULT_PAYROLL_CONFIG` with numbers from an authoritative source
 *      (CRA payroll deductions tables, or a maintained compliance library), and
 *   2. Load config per-user from `CONFIG#payroll` in DynamoDB instead of the default,
 *      so it can be updated without redeploying code (province varies, brackets
 *      change yearly).
 */

export interface PayrollConfig {
  province: string;
  cppRate: number; // employee portion, as a fraction of pensionable earnings
  cppBasicExemptionPerPeriod: number;
  eiRate: number; // employee portion
  federalRate: number; // flat-rate approximation for a single bracket, placeholder
  provincialRate: number; // flat-rate approximation, placeholder
  overtimeDailyThresholdHours: number; // hours/day before 1.5x kicks in
  overtimeMultiplier: number;
}

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  province: "BC",
  cppRate: 0.0595,
  cppBasicExemptionPerPeriod: 134.62, // ~ $3,500/yr exemption spread over 26 periods
  eiRate: 0.0164,
  federalRate: 0.15,
  provincialRate: 0.0506,
  overtimeDailyThresholdHours: 8,
  overtimeMultiplier: 1.5,
};

export interface ShiftHours {
  date: string;
  hourlyRate: number;
  hoursWorked: number;
  tips: number;
}

export interface PayrollBreakdown {
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

/** Splits each day's hours into regular vs. overtime and sums wages accordingly. */
export function splitRegularAndOvertime(
  shifts: ShiftHours[],
  config: PayrollConfig,
): { regularHours: number; overtimeHours: number; grossWages: number; grossTips: number } {
  const hoursByDate = new Map<string, { hours: number; rate: number }>();

  for (const s of shifts) {
    const existing = hoursByDate.get(s.date);
    if (existing) {
      existing.hours += s.hoursWorked;
    } else {
      hoursByDate.set(s.date, { hours: s.hoursWorked, rate: s.hourlyRate });
    }
  }

  let regularHours = 0;
  let overtimeHours = 0;
  let grossWages = 0;

  for (const { hours, rate } of hoursByDate.values()) {
    const regular = Math.min(hours, config.overtimeDailyThresholdHours);
    const overtime = Math.max(0, hours - config.overtimeDailyThresholdHours);
    regularHours += regular;
    overtimeHours += overtime;
    grossWages += regular * rate + overtime * rate * config.overtimeMultiplier;
  }

  const grossTips = shifts.reduce((sum, s) => sum + s.tips, 0);

  return { regularHours, overtimeHours, grossWages, grossTips };
}

export function calculateDeductions(
  grossWages: number,
  config: PayrollConfig,
): PayrollBreakdown["deductions"] {
  const cppPensionable = Math.max(0, grossWages - config.cppBasicExemptionPerPeriod);
  const cpp = round2(cppPensionable * config.cppRate);
  const ei = round2(grossWages * config.eiRate);
  const federalTax = round2(grossWages * config.federalRate);
  const provincialTax = round2(grossWages * config.provincialRate);

  return {
    cpp,
    ei,
    federalTax,
    provincialTax,
    total: round2(cpp + ei + federalTax + provincialTax),
  };
}

export function calculatePayroll(
  shifts: ShiftHours[],
  config: PayrollConfig = DEFAULT_PAYROLL_CONFIG,
): PayrollBreakdown {
  const { regularHours, overtimeHours, grossWages, grossTips } = splitRegularAndOvertime(shifts, config);
  // Deductions apply to wages, not tips (direct tips are generally not
  // CPP/EI-pensionable — see the note in docs/ARCHITECTURE.md). Verify this
  // per-jurisdiction before relying on it.
  const deductions = calculateDeductions(grossWages, config);
  const gross = round2(grossWages + grossTips);

  return {
    regularHours: round2(regularHours),
    overtimeHours: round2(overtimeHours),
    grossWages: round2(grossWages),
    grossTips: round2(grossTips),
    gross,
    deductions,
    net: round2(gross - deductions.total),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
