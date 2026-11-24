import { useState, type ReactNode } from 'react';

export function Equalizer({ active, bars = 5 }: { active: boolean; bars?: number }) {
  return (
    <div className={`eq ${active ? 'eq--on' : ''}`} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} style={{ animationDelay: `${(i * 137) % 600}ms` }} />
      ))}
    </div>
  );
}

/** Circular countdown. `progress` goes from 0 (full) to 1 (empty). */
export function Ring({ progress, label, size = 132 }: { progress: number; label: ReactNode; size?: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size}>
        <circle cx="60" cy="60" r={r} className="ring__track" />
        <circle
          cx="60"
          cy="60"
          r={r}
          className="ring__bar"
          strokeDasharray={c}
          strokeDashoffset={c * p}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="ring__label">{label}</div>
    </div>
  );
}

export function ErrorBox({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  if (!children) return null;
  return (
    <div className="error" role="alert">
      <span>⚠️</span>
      <div className="error__text">{children}</div>
      {onClose && (
        <button className="link" onClick={onClose} aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}

export function Spinner({ label }: { label?: ReactNode }) {
  return (
    <div className="spinner">
      <Equalizer active bars={4} />
      {label && <span>{label}</span>}
    </div>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy">
      <code>{value}</code>
      <button
        className="btn btn--small"
        onClick={() => {
          navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

export function BackButton({ onClick, children = 'Back' }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button className="back" onClick={onClick}>
      ← {children}
    </button>
  );
}

export function Cover({ src, alt, size = 56 }: { src?: string; alt: string; size?: number }) {
  return src ? (
    <img className="cover" src={src} alt={alt} width={size} height={size} loading="lazy" />
  ) : (
    <div className="cover cover--empty" style={{ width: size, height: size }} aria-hidden>
      ♪
    </div>
  );
}

/** A selectable row (checkbox style) used for playlists and song packs. */
export function PickRow({
  checked,
  onChange,
  image,
  emoji,
  title,
  subtitle,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  image?: string;
  emoji?: string;
  title: string;
  subtitle?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`pick ${checked ? 'pick--on' : ''} ${disabled ? 'pick--off' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {emoji ? <div className="pick__emoji">{emoji}</div> : <Cover src={image} alt="" size={48} />}
      <div className="pick__text">
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
      </div>
      <span className="pick__check" aria-hidden>
        {checked ? '✓' : ''}
      </span>
    </label>
  );
}

export function PlaybackChoice<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; title: string; text: string }[];
}) {
  return (
    <div className="choices">
      {options.map((o) => (
        <label key={o.value} className={`choice ${value === o.value ? 'choice--on' : ''}`}>
          <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} />
          <strong>{o.title}</strong>
          <small>{o.text}</small>
        </label>
      ))}
    </div>
  );
}
