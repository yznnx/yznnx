import { useState } from "react";
import { Lock, ShieldCheck, Trash2, Upload } from "lucide-react";
import { createVault, importBackup, unlockVault, wipeVault } from "../lib/vault";
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
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [forgot, setForgot] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const ok = await unlockVault(pw).catch(() => false);
    if (ok) onUnlock();
    else {
      setError("Wrong password.");
      setAttempts((n) => n + 1);
      setBusy(false);
    }
  };

  if (forgot)
    return (
      <ForgotPassword
        onBack={() => setForgot(false)}
        onRestored={() => {
          setForgot(false);
          onUnlock();
        }}
      />
    );

  return (
    <div className="lock">
      <form className="lock-box stack" onSubmit={submit}>
        <div className="logo">🔒</div>
        <h1>Study Vault is locked</h1>
        <p className="muted">Enter your password to decrypt your lectures.</p>
        <div className="row nowrap">
          <input
            className="input"
            type={show ? "text" : "password"}
            autoFocus
            placeholder="Password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
          />
          <button type="button" className="btn" onClick={() => setShow((v) => !v)}>
            {show ? "Hide" : "Show"}
          </button>
        </div>
        {error && (
          <div className="pill bad">
            {error}
            {attempts >= 2 ? " Check Caps Lock and the keyboard layout (e.g. Swiss/German: y ↔ z)." : ""}
          </div>
        )}
        <button className="btn primary lg" disabled={busy || !pw}>
          <Lock size={16} /> {busy ? "Unlocking…" : "Unlock"}
        </button>
        <button type="button" className="btn ghost sm" style={{ alignSelf: "center" }} onClick={() => setForgot(true)}>
          Forgot your password?
        </button>
      </form>
    </div>
  );
}

function ForgotPassword({ onBack, onRestored }: { onBack: () => void; onRestored: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="lock">
      <div className="lock-box stack">
        <div className="logo">🔑</div>
        <h1>Forgot your password?</h1>
        <p className="small" style={{ margin: 0 }}>
          Your vault is encrypted with your password and the password is not stored anywhere. That is what keeps it private – but it also means <b>nobody can recover it</b>, not even
          the developer. Your options:
        </p>
        <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
          <li>
            <b>Keep trying.</b> There is no limit on attempts. Try variations, Caps Lock, and other keyboard layouts.
          </li>
          <li>
            <b>Restore a backup</b> (.studyvault file) – it opens with the password you had when you made the backup.
          </li>
          <li>
            <b>Start over:</b> delete this vault and create a new one. Your lectures, flashcards and progress on this device are deleted for good – your original PDFs on your
            computer are not affected, you can upload them again.
          </li>
        </ol>
        <RestoreLink onDone={onRestored} />
        <hr style={{ margin: "4px 0" }} />
        <label className="field">
          To start over, type DELETE
          <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
        </label>
        <button
          className="btn danger solid"
          disabled={confirmText !== "DELETE" || busy}
          onClick={async () => {
            setBusy(true);
            await wipeVault();
            location.hash = "";
            location.reload();
          }}
        >
          <Trash2 size={15} /> Delete vault and start over
        </button>
        <button type="button" className="btn ghost" onClick={onBack}>
          ← Back – I'll try again
        </button>
      </div>
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
