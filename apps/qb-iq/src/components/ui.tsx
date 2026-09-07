/**
 * The shared surface: panels, tiles, badges and the metric-definition popover.
 *
 * The rule this file exists to enforce is that no number reaches the screen
 * without its dictionary entry attached. `StatTile` takes a `MetricId`, not a
 * label and a unit, so the definition, the unit, the direction and the published
 * reference range come from one place and cannot drift apart from the figure
 * they describe.
 *
 * Everything is sized for a room rather than a laptop: tile values are large
 * enough to read from the back, labels are small and quiet, and the accent
 * colour is spent only on the thing that is currently live.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { metric, type MetricId } from '../domain/metrics';
import { deltaIsGood, formatDelta, formatValue, inBand } from '../lib/format';
import { STATUS } from '../lib/palette';

// ── Panel ───────────────────────────────────────────────────────────────────

export function Panel({
  title,
  eyebrow,
  actions,
  note,
  children,
  className = '',
  padded = true,
}: {
  title?: string;
  eyebrow?: string;
  actions?: ReactNode;
  note?: string;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`print-avoid-break print-surface rounded-sm border border-hairline bg-panel ${className}`}
    >
      {(title || eyebrow || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
            {title && <h2 className="print-ink truncate text-[13px] font-semibold tracking-tight text-ink">{title}</h2>}
            {note && <p className="print-ink-2 mt-1 text-[11px] leading-snug text-ink-3">{note}</p>}
          </div>
          {actions && <div className="no-print shrink-0">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

// ── Metric definition popover ───────────────────────────────────────────────

/**
 * The "why is this number here" affordance. Every metric label in the app can
 * open one; it names the unit, how the figure is measured, why a staff would
 * look at it, and the published range where one exists.
 */
export function MetricInfo({ id, align = 'left' }: { id: MetricId; align?: 'left' | 'right' }) {
  const def = metric(id);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="no-print relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Definition of ${def.label}`}
        onClick={() => setOpen((value) => !value)}
        className={`grid h-[14px] w-[14px] place-items-center rounded-full border text-[9px] leading-none transition-colors ${
          open
            ? 'border-accent bg-accent text-void'
            : 'border-hairline-strong text-ink-3 hover:border-accent hover:text-accent'
        }`}
      >
        i
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          className={`absolute top-5 z-50 w-[320px] rounded-sm border border-hairline-strong bg-raised p-3 text-left shadow-2xl shadow-black/60 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[12px] font-semibold text-ink">{def.label}</h3>
            <span className="num text-[10px] text-accent">{def.unit || 'index'}</span>
          </div>
          <dl className="mt-2 space-y-2">
            <div>
              <dt className="eyebrow">Measured as</dt>
              <dd className="mt-1 text-[11px] leading-relaxed text-ink-2">{def.definition}</dd>
            </div>
            <div>
              <dt className="eyebrow">Why it matters</dt>
              <dd className="mt-1 text-[11px] leading-relaxed text-ink-2">{def.why}</dd>
            </div>
            {def.reference && (
              <div>
                <dt className="eyebrow">Published range</dt>
                <dd className="mt-1 text-[11px] leading-relaxed text-ink-3">{def.reference}</dd>
              </div>
            )}
            <div>
              <dt className="eyebrow">Direction</dt>
              <dd className="mt-1 text-[11px] text-ink-3">
                {def.better === 'band' && def.band
                  ? `target window ${def.band[0]}–${def.band[1]} ${def.unit}`
                  : def.better === 'higher'
                    ? 'higher is better'
                    : 'lower is better'}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

// ── Stat tile ───────────────────────────────────────────────────────────────

export function StatTile({
  id,
  value,
  delta,
  deltaLabel,
  sub,
  spark,
  size = 'md',
  active = false,
  onClick,
}: {
  id: MetricId;
  value: number | null;
  delta?: number | null;
  deltaLabel?: string;
  sub?: string;
  spark?: (number | null)[];
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
  onClick?: () => void;
}) {
  const def = metric(id);
  const good = deltaIsGood(id, delta ?? null);
  const banded = inBand(id, value);
  const valueSize = size === 'lg' ? 'text-[40px]' : size === 'sm' ? 'text-[20px]' : 'text-[28px]';

  const body = (
    <>
      <div className="flex items-center gap-1.5">
        <span className="eyebrow truncate">{def.short}</span>
        <MetricInfo id={id} />
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={`num print-ink ${valueSize} font-medium leading-none tabular-nums ${
            banded === false ? 'text-warning' : 'text-ink'
          }`}
        >
          {formatValue(id, value)}
        </span>
        {def.unit && <span className="num print-ink-2 text-[11px] text-ink-3">{def.unit}</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {delta !== undefined && delta !== null && (
          <span
            className="num text-[11px]"
            style={{ color: good === null ? 'var(--color-ink-3)' : good ? STATUS.good : STATUS.serious }}
          >
            {formatDelta(id, delta)}
            {deltaLabel ? <span className="ml-1 text-ink-3">{deltaLabel}</span> : null}
          </span>
        )}
        {sub && <span className="print-ink-2 truncate text-[10px] text-ink-3">{sub}</span>}
      </div>
      {spark && spark.length > 2 && (
        <div className="mt-2">
          <Sparkline values={spark} better={def.better} />
        </div>
      )}
    </>
  );

  const shell = `print-surface block w-full rounded-sm border px-3 py-3 text-left transition-colors ${
    active ? 'border-accent bg-raised' : 'border-hairline bg-panel'
  }`;

  return onClick ? (
    <button type="button" onClick={onClick} className={`${shell} hover:border-hairline-strong`}>
      {body}
    </button>
  ) : (
    <div className={shell}>{body}</div>
  );
}

// ── Sparkline ───────────────────────────────────────────────────────────────

/**
 * A trend under a number, not a chart. No axes, no labels, no tooltip: it exists
 * to answer "which way has this been going" at a glance, and the drill-down
 * views answer everything else.
 */
export function Sparkline({
  values,
  better = 'higher',
  height = 22,
}: {
  values: (number | null)[];
  better?: 'higher' | 'lower' | 'band';
  height?: number;
}) {
  const points = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (points.length < 3) return <div style={{ height }} />;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const width = 100;
  const step = width / (points.length - 1);
  const path = points
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${(index * step).toFixed(2)},${(height - ((value - min) / span) * (height - 4) - 2).toFixed(2)}`)
    .join(' ');

  const first = points[0] as number;
  const last = points[points.length - 1] as number;
  const rising = last > first;
  const colour =
    better === 'band'
      ? 'var(--color-ink-2)'
      : (better === 'higher') === rising
        ? STATUS.good
        : STATUS.serious;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-[22px] w-full" aria-hidden="true">
      <path d={path} fill="none" stroke={colour} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      <circle
        cx={width}
        cy={height - ((last - min) / span) * (height - 4) - 2}
        r={2}
        fill={colour}
      />
    </svg>
  );
}

// ── Small parts ─────────────────────────────────────────────────────────────

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'good' | 'warning' | 'serious' | 'critical';
}) {
  const tones: Record<string, string> = {
    neutral: 'border-hairline-strong text-ink-3',
    accent: 'border-accent/60 text-accent',
    good: 'border-[#0ca30c]/60 text-[#0ca30c]',
    warning: 'border-[#fab219]/60 text-[#fab219]',
    serious: 'border-[#ec835a]/60 text-[#ec835a]',
    critical: 'border-[#d03b3b]/70 text-[#d03b3b]',
  };
  return (
    <span className={`num inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** A labelled row of a definition list — the workhorse of the dense panels. */
export function DataRow({
  label,
  value,
  unit,
  tone,
  info,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: string;
  info?: MetricId;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hairline/60 py-1.5 last:border-0">
      <span className="flex items-center gap-1.5 text-[11px] text-ink-2">
        {label}
        {info && <MetricInfo id={info} />}
      </span>
      <span className="num shrink-0 text-[12px]" style={tone ? { color: tone } : undefined}>
        {value}
        {unit && <span className="ml-1 text-[10px] text-ink-3">{unit}</span>}
      </span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[120px] place-items-center px-4 text-center text-[11px] leading-relaxed text-ink-3">
      {children}
    </div>
  );
}

/** Sample-size note. Shown wherever a figure could be mistaken for a finding. */
export function Sample({ n, of }: { n: number; of?: string }) {
  return (
    <span className="num text-[10px] text-ink-3">
      n = {n}
      {of ? ` ${of}` : ''}
    </span>
  );
}

export function SectionTitle({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h3 className="print-ink text-[12px] font-semibold tracking-tight text-ink">{children}</h3>
      {note && <span className="print-ink-2 text-[10px] text-ink-3">{note}</span>}
    </div>
  );
}

/** Segmented control. Used for every "which slice am I looking at" choice. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className="no-print flex items-center gap-2">
      {label && <span className="eyebrow">{label}</span>}
      <div className="flex rounded-sm border border-hairline bg-sunken p-0.5" role="tablist" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={option.value === value}
            onClick={() => onChange(option.value)}
            className={`num rounded-[2px] px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] transition-colors ${
              option.value === value ? 'bg-accent text-void' : 'text-ink-3 hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
