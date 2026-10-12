import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

const spring = { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 } as const;

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle${on ? ' is-on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <motion.span className="toggle-thumb" layout transition={spring} />
    </button>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  id,
  label,
}: {
  options: SegmentOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  /** Unique id so the sliding pill animates within its own control. */
  id: string;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`segment${value === o.value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {value === o.value && <motion.span layoutId={`seg-${id}`} className="segment-pill" transition={spring} />}
          <span className="segment-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
