import { useState, type FormEvent } from "react";
import * as auth from "../auth";

type Mode = "signIn" | "signUp" | "confirm";

export default function AuthView({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "signUp") {
      run(async () => {
        await auth.signUp(email, password);
        setNotice("Check your email for a confirmation code.");
        setMode("confirm");
      });
    } else if (mode === "confirm") {
      run(async () => {
        await auth.confirmSignUp(email, code);
        setNotice("Confirmed — sign in to continue.");
        setMode("signIn");
      });
    } else {
      run(async () => {
        await auth.signIn(email, password);
        onAuthenticated();
      });
    }
  };

  return (
    <div className="view" style={{ paddingTop: 10 }}>
      <div className="paste-panel">
        <h2>{mode === "signUp" ? "Create account" : mode === "confirm" ? "Confirm your email" : "Sign in"}</h2>
        {notice && <p style={{ color: "var(--teal-dark)" }}>{notice}</p>}
        <form onSubmit={handleSubmit}>
          {mode !== "confirm" && (
            <>
              <input
                className="text-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <input
                className="text-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
              />
            </>
          )}
          {mode === "confirm" && (
            <input
              className="text-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Confirmation code"
            />
          )}
          {error && <div className="feedback error">{error}</div>}
          <div className="paste-actions">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Working…" : mode === "signUp" ? "Sign up" : mode === "confirm" ? "Confirm" : "Sign in"}
            </button>
          </div>
        </form>

        {mode === "signIn" && (
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
            New here?{" "}
            <button className="edit-btn" onClick={() => setMode("signUp")}>
              Create an account
            </button>
          </p>
        )}
        {mode === "signUp" && (
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
            Already have one?{" "}
            <button className="edit-btn" onClick={() => setMode("signIn")}>
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
