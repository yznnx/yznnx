import { useState } from "react";
import { Lock, ShieldCheck, Upload } from "lucide-react";
import { createVault, importBackup, unlockVault } from "../lib/vault";
import { toast } from "../components/ui";

export function SetupScreen({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (pw !== pw2) return setError("The passwords don't match.");
    setBusy(true);
    try {
      await createVault(pw);
      navigator.storage?.persist?.().catch(() => {});
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="lock">
      <form className="lock-box stack" onSubmit={submit}>
        <div className="logo">📚</div>
        <h1>Your private Study Vault</h1>
        <p className="muted">
          Everything you upload stays on <b>this device</b>, encrypted with a password only you know. There is no account and no server – nobody else can see your
          lectures, notes or progress.
        </p>
        <label className="field">
          Choose a password
          <input className="input" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="field">
          Repeat password
          <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        </label>
        {error && <div className="pill bad">{error}</div>}
        <div className="small muted" style={{ display: "flex", gap: 8 }}>
          <ShieldCheck size={18} style={{ flexShrink: 0 }} />
          <span>
            There is no "forgot password". If you lose it, the data can't be recovered – write it down somewhere safe and make backups (Settings → Backup).
          </span>
        </div>
        <button className="btn primary lg" disabled={busy}>
          {busy ? "Creating vault…" : "Create my vault"}
        </button>
        <RestoreLink onDone={onDone} />
      </form>
    </div>
  );
}

export function UnlockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const ok = await unlockVault(pw).catch(() => false);
    if (ok) onUnlock();
    else {
      setError("Wrong password.");
      setBusy(false);
    }
  };

  return (
    <div className="lock">
      <form className="lock-box stack" onSubmit={submit}>
        <div className="logo">🔒</div>
        <h1>Study Vault is locked</h1>
        <p className="muted">Enter your password to decrypt your lectures.</p>
        <input className="input" type="password" autoFocus placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        {error && <div className="pill bad">{error}</div>}
        <button className="btn primary lg" disabled={busy || !pw}>
          <Lock size={16} /> {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

function RestoreLink({ onDone }: { onDone: () => void }) {
  return (
    <label className="btn ghost sm" style={{ alignSelf: "center" }}>
      <Upload size={14} /> Restore from a backup file
      <input
        type="file"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            await importBackup(await f.arrayBuffer());
            toast("Backup restored – unlock it with the backup's password.");
            onDone();
          } catch (err) {
            toast(err instanceof Error ? err.message : String(err), true);
          }
        }}
      />
    </label>
  );
}
