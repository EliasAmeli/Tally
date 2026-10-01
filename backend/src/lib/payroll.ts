/**
 * Payroll math for 2026, British Columbia.
 *
 * Sources (checked Sep 2026):
 *  - CPP: rate, YMPE, basic exemption, CPP2 — Canada Revenue Agency 2026 CPP
 *    contribution announcement (YMPE $74,600, YAMPE $85,000, rate 5.95%/4%,
 *    basic exemption $3,500/yr).
 *  - EI: rate 1.63%, max insurable earnings $68,900/yr — CRA 2026 EI premium figures.
 *  - Federal brackets + Basic Personal Amount — CRA 2026 federal tax bracket
 *    announcement (lowest rate cut to 14% for the full 2026 year; BPA $16,452,
 *    phasing down to $14,829 between $181,440 and $258,482).
 *  - BC brackets: the first two are confirmed from gov.bc.ca ("Personal income
 *    tax rates", updated Feb 2026) and the BC 2026/27 budget, which raised the
 *    lowest BC rate from 5.06% to 5.60% effective Jan 1, 2026. Brackets above
 *    $100,728 are NOT verified here (sources disagreed) — they're set to the
 *    last confirmed rate as a conservative placeholder. This doesn't affect
 *    typical part-time earnings, which fall in the first bracket or two, but
 *    must be fixed before this app is used by anyone earning into those ranges.
 *
 * This file still does NOT track year-to-date earnings across pay periods —
 * each period's tax/CPP/EI is estimated by annualizing that period's gross
 * (gross * periodsPerYear), which is the standard payroll "periodic method"
 * CRA describes, but it means someone who stops working partway through the
 * year will look over-deducted here relative to their real annual return.
 * Good enough for a live estimate; not a substitute for a T4/tax filing.
 */

export interface TaxBracket {
  upTo: number; // exclusive upper bound of this bracket, Infinity for the top one
  rate: number;
}

export interface PayrollConfig {
  periodsPerYear: number; // 52 for weekly, 26 for biweekly, etc.

  cppRate: number;
  cppBasicExemptionAnnual: number;
  cppYmpe: number; // ceiling for base CPP (CPP1)
  cpp2Rate: number;
  cpp2Yampe: number; // ceiling for the CPP2 band

  eiRate: number;
  eiMaxInsurableAnnual: number;

  federalBrackets: TaxBracket[];
  federalBpa: number; // basic personal amount, full
  federalBpaMin: number; // minimum BPA once income exceeds the phase-out band
  federalBpaPhaseOutStart: number;
  federalBpaPhaseOutEnd: number;

  bcBrackets: TaxBracket[];
}

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  periodsPerYear: 52,

  cppRate: 0.0595,
  cppBasicExemptionAnnual: 3500,
  cppYmpe: 74600,
  cpp2Rate: 0.04,
  cpp2Yampe: 85000,

  eiRate: 0.0163,
  eiMaxInsurableAnnual: 68900,

  federalBrackets: [
    { upTo: 58523, rate: 0.14 },
    { upTo: 117045, rate: 0.205 },
    { upTo: 181440, rate: 0.26 },
    { upTo: 258482, rate: 0.29 },
    { upTo: Infinity, rate: 0.33 },
  ],
  federalBpa: 16452,
  federalBpaMin: 14829,
  federalBpaPhaseOutStart: 181440,
  federalBpaPhaseOutEnd: 258482,

  bcBrackets: [
    { upTo: 50363, rate: 0.056 },
    { upTo: 100728, rate: 0.077 },
    // Everything above here reuses 7.7% as a conservative placeholder —
    // NOT the real higher BC brackets. See the file header note.
    { upTo: Infinity, rate: 0.077 },
  ],
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Marginal tax on an annual income given a bracket table. */
function taxForBrackets(annualIncome: number, brackets: TaxBracket[]): number {
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of brackets) {
    if (annualIncome <= lower) break;
    const taxableInThisBracket = Math.min(annualIncome, upTo) - lower;
    tax += Math.max(0, taxableInThisBracket) * rate;
    lower = upTo;
  }
  return tax;
}

function federalBpaCredit(annualIncome: number, config: PayrollConfig): number {
  const { federalBpa, federalBpaMin, federalBpaPhaseOutStart, federalBpaPhaseOutEnd, federalBrackets } = config;
  let bpa: number;
  if (annualIncome <= federalBpaPhaseOutStart) {
    bpa = federalBpa;
  } else if (annualIncome >= federalBpaPhaseOutEnd) {
    bpa = federalBpaMin;
  } else {
    const fraction =
      (annualIncome - federalBpaPhaseOutStart) / (federalBpaPhaseOutEnd - federalBpaPhaseOutStart);
    bpa = federalBpa - fraction * (federalBpa - federalBpaMin);
  }
  // The BPA is a non-refundable credit applied at the lowest bracket's rate.
  return bpa * federalBrackets[0].rate;
}

/** Splits each day's hours into regular vs. overtime and sums wages accordingly. */
export function splitRegularAndOvertime(
  shifts: ShiftHours[],
  overtimeDailyThresholdHours = 8,
  overtimeMultiplier = 1.5,
): { regularHours: number; overtimeHours: number; grossWages: number; grossTips: number } {
  const hoursByDate = new Map<string, { hours: number; rate: number }>();

  for (const s of shifts) {
    const existing = hoursByDate.get(s.date);
    if (existing) existing.hours += s.hoursWorked;
    else hoursByDate.set(s.date, { hours: s.hoursWorked, rate: s.hourlyRate });
  }

  let regularHours = 0;
  let overtimeHours = 0;
  let grossWages = 0;

  for (const { hours, rate } of hoursByDate.values()) {
    const regular = Math.min(hours, overtimeDailyThresholdHours);
    const overtime = Math.max(0, hours - overtimeDailyThresholdHours);
    regularHours += regular;
    overtimeHours += overtime;
    grossWages += regular * rate + overtime * rate * overtimeMultiplier;
  }

  const grossTips = shifts.reduce((sum, s) => sum + s.tips, 0);
  return { regularHours, overtimeHours, grossWages, grossTips };
}

export function calculateDeductions(
  periodGrossWages: number,
  config: PayrollConfig,
): PayrollBreakdown["deductions"] {
  const annualized = periodGrossWages * config.periodsPerYear;

  // --- CPP (base + CPP2), annualized then prorated back to this period ---
  const cppPensionable = Math.max(
    0,
    Math.min(annualized, config.cppYmpe) - config.cppBasicExemptionAnnual,
  );
  const cppAnnual = cppPensionable * config.cppRate;

  const cpp2Band = Math.max(0, Math.min(annualized, config.cpp2Yampe) - config.cppYmpe);
  const cpp2Annual = cpp2Band * config.cpp2Rate;

  const cppPeriod = (cppAnnual + cpp2Annual) / config.periodsPerYear;

  // --- EI: flat rate from the first dollar, capped at max insurable earnings ---
  const eiInsurableAnnual = Math.min(annualized, config.eiMaxInsurableAnnual);
  const eiPeriod = (eiInsurableAnnual * config.eiRate) / config.periodsPerYear;

  // --- Federal & provincial tax: annualize, apply brackets, apply BPA credit, prorate back ---
  const federalTaxAnnual = Math.max(
    0,
    taxForBrackets(annualized, config.federalBrackets) - federalBpaCredit(annualized, config),
  );
  const federalTaxPeriod = federalTaxAnnual / config.periodsPerYear;

  const bcTaxAnnual = taxForBrackets(annualized, config.bcBrackets);
  const bcTaxPeriod = bcTaxAnnual / config.periodsPerYear;

  return {
    cpp: round2(cppPeriod),
    ei: round2(eiPeriod),
    federalTax: round2(federalTaxPeriod),
    provincialTax: round2(bcTaxPeriod),
    total: round2(cppPeriod + eiPeriod + federalTaxPeriod + bcTaxPeriod),
  };
}

export function calculatePayroll(
  shifts: ShiftHours[],
  config: PayrollConfig = DEFAULT_PAYROLL_CONFIG,
): PayrollBreakdown {
  const { regularHours, overtimeHours, grossWages, grossTips } = splitRegularAndOvertime(shifts);
  // Deductions apply to wages, not tips — direct/cash tips are generally not
  // CPP/EI-pensionable in Canada, but employer-controlled tip pools usually
  // are. Verify which applies before trusting this split for a given user.
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
