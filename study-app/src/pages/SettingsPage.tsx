import { useEffect, useState } from "react";
import { Download, KeyRound, Lock, ShieldCheck, Trash2, Upload } from "lucide-react";
import { flushWrites, saveSettings, settings, useStore } from "../lib/store";
import { changePassword, exportBackup, importBackup, wipeVault } from "../lib/vault";
import { AI_MODELS, friendlyError, testKey } from "../lib/ai";
import { Modal, Seg, toast } from "../components/ui";
import { dayKey, downloadBlob, formatBytes } from "../lib/util";
import type { Settings } from "../lib/types";

export function SettingsPage({ onLock }: { onLock: () => void }) {
  useStore();
  const s = settings();
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const set = (patch: Partial<Settings>) => saveSettings(patch);

  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 }))
      .catch(() => {});
  }, []);

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <h1>Settings</h1>

      <div className="card stack">
        <h2>
          <ShieldCheck size={20} /> Privacy
        </h2>
        <p className="small muted" style={{ margin: 0 }}>
          All your files, notes and progress are stored only on this device (inside this app or browser), encrypted with AES-256 using a key derived from your password. There is no account,
          no server and no tracking. Only you can open it. If you enable the AI tutor, the text (or pages) you ask about is sent to Anthropic's API with your own key – nothing else
          ever leaves the device.
        </p>
        <div className="grid cols-2">
          <label className="field">
            Lock automatically after
            <select className="input" value={s.autoLockMinutes} onChange={(e) => set({ autoLockMinutes: Number(e.target.value) })}>
              {[5, 15, 30, 60, 120, 0].map((m) => (
                <option key={m} value={m}>
                  {m ? `${m} minutes of inactivity` : "Never"}
                </option>
              ))}
            </select>
          </label>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <button className="btn" onClick={() => setPwOpen(true)}>
              <KeyRound size={15} /> Change password
            </button>
            <button className="btn" onClick={onLock}>
              <Lock size={15} /> Lock now
            </button>
          </div>
        </div>
      </div>

      <div className="card stack">
        <h2>Studying</h2>
        <label className="field">
          Your first name <span className="hint">Only used for the greeting.</span>
          <input className="input" value={s.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <div className="field">
          Difficulty & strictness
          <Seg
            value={s.examLevel}
            onChange={(v) => set({ examLevel: v })}
            options={[
              { value: "eth", label: "ETH level – hard & strict" },
              { value: "standard", label: "Standard" },
            ]}
          />
          <span className="hint">Controls how hard AI questions/problems are and how strictly your answers are graded.</span>
        </div>
        <label className="check">
          <input type="checkbox" checked={s.typeAnswers} onChange={(e) => set({ typeAnswers: e.target.checked })} />
          <span>
            <b>Type your answer before a flashcard is revealed</b>
            <br />
            <span className="small muted">Forces real recall instead of "yeah, I knew that".</span>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.negativeMarking} onChange={(e) => set({ negativeMarking: e.target.checked })} />
          <span>
            <b>Negative marking for true/false questions</b>
            <br />
            <span className="small muted">Like many ETH multiple-choice exams: a wrong answer costs a point, an open one costs nothing.</span>
          </span>
        </label>
        <div className="grid cols-3">
          <label className="field">
            New flashcards per day
            <input className="input" type="number" min={0} max={500} value={s.newCardsPerDay} onChange={(e) => set({ newCardsPerDay: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label className="field">
            Focus session (min)
            <input className="input" type="number" min={5} max={120} value={s.pomodoroMinutes} onChange={(e) => set({ pomodoroMinutes: Math.max(5, Number(e.target.value) || 25) })} />
          </label>
          <label className="field">
            Break (min)
            <input className="input" type="number" min={1} max={60} value={s.breakMinutes} onChange={(e) => set({ breakMinutes: Math.max(1, Number(e.target.value) || 5) })} />
          </label>
        </div>
        <div className="field">
          Theme
          <Seg
            value={s.theme}
            onChange={(v) => set({ theme: v })}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>
      </div>

      <div className="card stack">
        <h2>✨ Claude (optional)</h2>
        <p className="small" style={{ margin: 0 }}>There are two ways to let Claude make hard questions and grade your answers:</p>
        <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
          <li>
            <b>With your normal Claude subscription – no setup.</b> In any file open the <b>AI tutor</b> tab (or "Rate with Claude", "Check with Claude" in exercises and exam
            practice). The app writes the prompt, you paste it into the Claude app or claude.ai and paste the answer back.
          </li>
          <li>
            <b>One-click with an API key</b> (below). Everything happens inside the app – explanations, chat, automatic grading. Create a key at console.anthropic.com → API
            keys; usage is billed by Anthropic separately from a Claude subscription.
          </li>
        </ol>
        <p className="small muted" style={{ margin: 0 }}>
          The key is stored encrypted inside your vault. Requests go straight from this app to Anthropic – there is no server in between.
        </p>
        <label className="check">
          <input type="checkbox" checked={s.aiEnabled} onChange={(e) => set({ aiEnabled: e.target.checked })} />
          <span>
            <b>Use my API key for one-click AI</b>
          </span>
        </label>
        <label className="field">
          Anthropic API key
          <div className="row nowrap">
            <input
              className="input"
              type={showKey ? "text" : "password"}
              placeholder="sk-ant-…"
              value={s.apiKey}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => set({ apiKey: e.target.value.trim() })}
            />
            <button className="btn" type="button" onClick={() => setShowKey((v) => !v)}>
              {showKey ? "Hide" : "Show"}
            </button>
            <button
              className="btn"
              type="button"
              disabled={!s.apiKey || testing}
              onClick={async () => {
                setTesting(true);
                try {
                  await testKey();
                  toast("The API key works ✓");
                  if (!s.aiEnabled) set({ aiEnabled: true });
                } catch (e) {
                  toast(friendlyError(e), true);
                } finally {
                  setTesting(false);
                }
              }}
            >
              {testing ? "Testing…" : "Test"}
            </button>
          </div>
        </label>
        <div className="grid cols-2">
          <label className="field">
            Model
            <select className="input" value={s.aiModel} onChange={(e) => set({ aiModel: e.target.value as Settings["aiModel"] })}>
              {AI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} – {m.hint}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Answer language
            <select className="input" value={s.aiLanguage} onChange={(e) => set({ aiLanguage: e.target.value as Settings["aiLanguage"] })}>
              <option value="auto">Same as the material</option>
              <option value="English">English</option>
              <option value="German">Deutsch</option>
            </select>
          </label>
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>
          If a request is declined by Claude's safety filters, it is automatically retried on a fallback model (Opus/Sonnet only).
        </p>
      </div>

      <div className="card stack">
        <h2>Backup & devices</h2>
        <p className="small muted" style={{ margin: 0 }}>
          The backup file contains everything and stays encrypted with your password – safe to keep on a USB stick or cloud drive. Restore it here or on another device to move
          your vault. Browsers can delete site data when the disk is full or if you clear your history, so make a backup regularly.
          {usage && usage.quota ? ` Using ${formatBytes(usage.used)} of ${formatBytes(usage.quota)} available.` : ""}
        </p>
        <div className="row">
          <button
            className="btn primary"
            onClick={async () => {
              await flushWrites();
              const blob = await exportBackup();
              downloadBlob(blob, `study-vault-backup-${dayKey()}.studyvault`);
              toast("Backup downloaded.");
            }}
          >
            <Download size={15} /> Download backup
          </button>
          <label className="btn">
            <Upload size={15} /> Restore backup…
            <input
              type="file"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (!confirm("Restoring REPLACES everything in this vault with the backup. Continue?")) return;
                try {
                  await flushWrites();
                  await importBackup(await f.arrayBuffer());
                  toast("Backup restored – unlock with the backup's password.");
                  onLock();
                } catch (err) {
                  toast(err instanceof Error ? err.message : String(err), true);
                }
              }}
            />
          </label>
        </div>
      </div>

      <div className="card stack" style={{ borderColor: "var(--bad)" }}>
        <h2 style={{ color: "var(--bad)" }}>Danger zone</h2>
        <div className="row">
          <span className="small muted" style={{ flex: 1 }}>
            Delete the vault and all files from this device. Make a backup first if you want to keep anything.
          </span>
          <button className="btn danger solid" onClick={() => setWipeOpen(true)}>
            <Trash2 size={15} /> Delete everything
          </button>
        </div>
      </div>
      {pwOpen && <PasswordDialog onClose={() => setPwOpen(false)} />}
      {wipeOpen && <WipeDialog onClose={() => setWipeOpen(false)} />}
    </div>
  );
}

function WipeDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  return (
    <Modal
      title="Delete everything?"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn danger solid"
            disabled={text !== "DELETE"}
            onClick={async () => {
              await flushWrites();
              await wipeVault();
              location.hash = "";
              location.reload();
            }}
          >
            Delete everything
          </button>
        </>
      }
    >
      <div className="stack">
        <p style={{ margin: 0 }}>This deletes all lectures, files, flashcards and progress on this device. It cannot be undone.</p>
        <label className="field">
          Type DELETE to confirm
          <input className="input" autoFocus value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [oldPw, setOld] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (pw !== pw2) return setError("The new passwords don't match.");
    setBusy(true);
    const ok = await changePassword(oldPw, pw);
    setBusy(false);
    if (!ok) return setError("The current password is wrong.");
    toast("Password changed.");
    onClose();
  };
  return (
    <Modal
      title="Change password"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Change password"}
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          Current password
          <input className="input" type="password" value={oldPw} onChange={(e) => setOld(e.target.value)} autoFocus />
        </label>
        <label className="field">
          New password
          <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        <label className="field">
          Repeat new password
          <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        {error && <div className="pill bad">{error}</div>}
        <p className="tiny muted" style={{ margin: 0 }}>
          Old backups keep working with the password they were made with.
        </p>
      </div>
    </Modal>
  );
}
