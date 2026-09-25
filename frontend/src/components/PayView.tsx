import { useEffect, useState } from "react";
import * as api from "../api";
import type { PayrollBreakdown } from "../types";

export default function PayView() {
  const [data, setData] = useState<PayrollBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getCurrentPayroll().then(setData).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="view"><div className="feedback error">{error}</div></div>;
  if (!data) return <div className="view"><div className="feedback">Loading…</div></div>;

  const { period, regularHours, overtimeHours, gross, grossTips, deductions, net } = data;

  return (
    <div className="view">
      <div className="feedback" style={{ marginBottom: 10 }}>
        {period.start} – {period.end}
      </div>

      <div className="gross-card">
        <div className="label">Gross pay</div>
        <div className="value nums">${gross.toFixed(2)}</div>
        <div className="meta">
          {regularHours}h regular
          {overtimeHours > 0 ? ` + ${overtimeHours}h overtime` : ""}
          {grossTips > 0 ? ` · $${grossTips.toFixed(2)} tips` : ""}
        </div>
      </div>

      <div className="deductions">
        <div className="ded-row"><div className="name">CPP</div><div className="amt nums">–${deductions.cpp.toFixed(2)}</div></div>
        <div className="ded-row"><div className="name">EI</div><div className="amt nums">–${deductions.ei.toFixed(2)}</div></div>
        <div className="ded-row"><div className="name">Federal tax</div><div className="amt nums">–${deductions.federalTax.toFixed(2)}</div></div>
        <div className="ded-row"><div className="name">Provincial tax</div><div className="amt nums">–${deductions.provincialTax.toFixed(2)}</div></div>
      </div>

      <div className="net-card">
        <div className="label">Net pay (take-home)</div>
        <div className="value nums">${net.toFixed(2)}</div>
      </div>

      <div className="disclaimer">
        Deduction rates are placeholders, not verified CRA/BC figures — see
        docs/ARCHITECTURE.md before relying on these numbers.
      </div>
    </div>
  );
}
