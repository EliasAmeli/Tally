import { useState } from "react";
import ShiftsView from "./components/ShiftsView";
import PayView from "./components/PayView";

type Tab = "shifts" | "pay";

export default function App() {
  const [tab, setTab] = useState<Tab>("shifts");

  return (
    <div className="shell">
      <div className="header">
        <div className="logo">
          <span className="mark" />
          <span className="word">Tally</span>
        </div>
      </div>

      {tab === "shifts" ? <ShiftsView /> : <PayView />}

      <div className="tabbar">
        <button className={`tabbtn ${tab === "shifts" ? "active" : ""}`} onClick={() => setTab("shifts")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" />
          </svg>
          Shifts
        </button>
        <button className={`tabbtn ${tab === "pay" ? "active" : ""}`} onClick={() => setTab("pay")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1 3 2.3-1.3 2-3 2.2-3 .9-3 2.2 1.3 2.3 3 2.3 3-1.1 3-2.5" />
          </svg>
          Pay
        </button>
      </div>
    </div>
  );
}
