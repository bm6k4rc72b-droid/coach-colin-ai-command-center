/**
 * Chart primitives.
 *
 * Shared rules, applied in one place so no chart in the app can quietly break
 * them: thin marks, recessive grid and axes, text on the ink tokens rather than
 * the series colour, a hover tooltip on every plotted form, a legend whenever
 * there is more than one series, and no second y-axis anywhere — two measures on
 * different scales get two charts.
 */

import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Dot,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { ACCENT, AXIS, GRID, INK_2, INK_3, SERIES, seriesColor } from '../lib/palette';

export function ChartFrame({ height, children }: { height: number; children: ReactNode }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as never}
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipRow {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  unit?: string;
  payload?: Record<string, unknown>;
}

/** The one tooltip shape used everywhere: dark card, hairline border, mono values. */
export function QbTooltip({
  active,
  payload,
  label,
  unit,
  labelPrefix = '',
  precision = 1,
  extra,
}: {
  active?: boolean | undefined;
  payload?: TooltipRow[] | undefined;
  label?: string | number | undefined;
  unit?: string | undefined;
  labelPrefix?: string | undefined;
  precision?: number | undefined;
  extra?: ((row: Record<string, unknown>) => ReactNode) | undefined;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const first = payload[0]?.payload as Record<string, unknown> | undefined;
  return (
    <div className="rounded-sm border border-hairline-strong bg-raised px-2.5 py-2 shadow-xl shadow-black/60">
      {label !== undefined && (
        <div className="num mb-1 text-[10px] uppercase tracking-[0.12em] text-ink-3">
          {labelPrefix}
          {label}
        </div>
      )}
      {payload.map((row, index) => (
        <div key={`${String(row.name)}-${index}`} className="flex items-baseline gap-2">
          <span className="h-2 w-2 shrink-0 rounded-[1px]" style={{ background: row.color ?? ACCENT }} />
          <span className="text-[11px] text-ink-2">{row.name}</span>
          <span className="num ml-auto text-[11px] text-ink">
            {typeof row.value === 'number' ? row.value.toFixed(precision) : String(row.value ?? '—')}
            {(row.unit ?? unit) ? <span className="ml-1 text-ink-3">{row.unit ?? unit}</span> : null}
          </span>
        </div>
      ))}
      {extra && first ? <div className="mt-1.5 border-t border-hairline pt-1.5 text-[10px] text-ink-3">{extra(first)}</div> : null}
    </div>
  );
}

const AXIS_PROPS = {
  stroke: AXIS,
  tickLine: false,
  axisLine: { stroke: AXIS },
  tick: { fill: INK_3, fontSize: 10 },
} as const;

/** Legend rendered as chips, so identity never depends on colour alone. */
function legendContent(payload?: readonly { value?: string; color?: string }[]) {
  if (!payload) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {payload.map((entry) => (
        <span key={String(entry.value)} className="flex items-center gap-1.5 text-[10px] text-ink-2">
          <span className="h-2 w-2 rounded-[1px]" style={{ background: entry.color }} />
          {entry.value}
        </span>
      ))}
    </div>
  );
}

// ── Trend line ──────────────────────────────────────────────────────────────

export interface TrendPoint {
  label: string;
  value: number | null;
  fitted?: number | null;
  reps?: number;
}

/**
 * A metric over time, with the fitted trend drawn behind it and the metric's
 * target band shaded where it has one. Gaps in the data stay gaps: the line does
 * not bridge a week with no reps.
 */
export function TrendChart({
  data,
  unit,
  precision = 1,
  band,
  height = 200,
  colorIndex = 0,
  seriesName = 'Value',
  reference,
}: {
  data: TrendPoint[];
  unit?: string;
  precision?: number;
  band?: [number, number] | undefined;
  height?: number;
  colorIndex?: number;
  seriesName?: string;
  reference?: { value: number; label: string } | undefined;
}) {
  const colour = seriesColor(colorIndex);
  const hasFit = data.some((point) => point.fitted !== null && point.fitted !== undefined);
  return (
    <ChartFrame height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        {band && <ReferenceArea y1={band[0]} y2={band[1]} fill={ACCENT} fillOpacity={0.06} stroke="none" />}
        {reference && (
          <ReferenceLine
            y={reference.value}
            stroke={AXIS}
            strokeDasharray="3 3"
            label={{ value: reference.label, fill: INK_3, fontSize: 9, position: 'insideTopRight' }}
          />
        )}
        <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={14} />
        <YAxis {...AXIS_PROPS} width={44} domain={['auto', 'auto']} />
        <Tooltip content={<QbTooltip unit={unit} precision={precision} />} cursor={{ stroke: AXIS }} />
        {hasFit && (
          <Line
            type="linear"
            dataKey="fitted"
            name="Fitted trend"
            stroke={INK_3}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        )}
        <Line
          type="monotone"
          dataKey="value"
          name={seriesName}
          stroke={colour}
          strokeWidth={2}
          dot={{ r: 2.5, fill: colour, stroke: 'none' }}
          activeDot={{ r: 4.5, stroke: '#0f1318', strokeWidth: 2 }}
          isAnimationActive={false}
          connectNulls={false}
        />
        {hasFit && <Legend content={({ payload }) => legendContent(payload as never)} />}
      </ComposedChart>
    </ChartFrame>
  );
}

// ── Grouped bars ────────────────────────────────────────────────────────────

export interface GroupedBarRow {
  label: string;
  [key: string]: string | number | null;
}

/** Two or three named series across shared categories, with a 2px gap between fills. */
export function GroupedBars({
  data,
  keys,
  unit,
  precision = 1,
  height = 210,
  layout = 'horizontal',
}: {
  data: GroupedBarRow[];
  keys: { key: string; name: string; colorIndex: number }[];
  unit?: string;
  precision?: number;
  height?: number;
  layout?: 'horizontal' | 'vertical';
}) {
  const vertical = layout === 'vertical';
  return (
    <ChartFrame height={height}>
      <BarChart
        data={data}
        layout={layout}
        margin={{ top: 8, right: 16, bottom: 4, left: vertical ? 8 : 0 }}
        barGap={2}
        barCategoryGap={vertical ? '22%' : '28%'}
      >
        <CartesianGrid stroke={GRID} vertical={vertical} horizontal={!vertical} />
        {vertical ? (
          <>
            <XAxis type="number" {...AXIS_PROPS} />
            <YAxis type="category" dataKey="label" {...AXIS_PROPS} width={148} interval={0} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" {...AXIS_PROPS} interval={0} />
            <YAxis {...AXIS_PROPS} width={44} />
          </>
        )}
        <Tooltip content={<QbTooltip unit={unit} precision={precision} />} cursor={{ fill: 'rgb(255 255 255 / 0.04)' }} />
        {keys.length > 1 && <Legend content={({ payload }) => legendContent(payload as never)} />}
        {keys.map((entry) => (
          <Bar
            key={entry.key}
            dataKey={entry.key}
            name={entry.name}
            fill={seriesColor(entry.colorIndex)}
            radius={vertical ? [0, 3, 3, 0] : [3, 3, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartFrame>
  );
}

// ── Kinetic chain ───────────────────────────────────────────────────────────

export interface ChainPoint {
  segment: string;
  peak: number;
  timing: number;
  gap: number | null;
}

/**
 * The sequencing chart: peak angular velocity per segment as bars, with the peak
 * timing plotted as its own small-multiple strip below rather than on a second
 * y-axis. Two scales, two charts — never two axes on one.
 */
export function ChainPeaks({ data, height = 190 }: { data: ChainPoint[]; height?: number }) {
  return (
    <ChartFrame height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} barCategoryGap="34%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="segment" {...AXIS_PROPS} interval={0} />
        <YAxis {...AXIS_PROPS} width={48} />
        <Tooltip
          content={
            <QbTooltip
              unit="°/s"
              precision={0}
              extra={(row) => `peak at ${Number(row.timing).toFixed(0)} ms after front-foot plant`}
            />
          }
          cursor={{ fill: 'rgb(255 255 255 / 0.04)' }}
        />
        <Bar dataKey="peak" name="Peak angular velocity" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((point, index) => (
            <Cell key={point.segment} fill={seriesColor(index)} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/** Peak timing on its own axis: the ordering is the finding, so it gets its own strip. */
export function ChainTiming({ data, height = 170 }: { data: ChainPoint[]; height?: number }) {
  return (
    <ChartFrame height={height}>
      <ScatterChart margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis type="number" dataKey="timing" name="Time to peak" unit=" ms" {...AXIS_PROPS} domain={['dataMin - 12', 'dataMax + 12']} />
        <YAxis type="category" dataKey="segment" {...AXIS_PROPS} width={94} interval={0} />
        <ZAxis range={[70, 70]} />
        <Tooltip
          content={<QbTooltip unit="ms" precision={0} />}
          cursor={{ stroke: AXIS, strokeDasharray: '3 3' }}
        />
        <Scatter data={data} isAnimationActive={false}>
          {data.map((point, index) => (
            <Cell key={point.segment} fill={seriesColor(index)} />
          ))}
        </Scatter>
      </ScatterChart>
    </ChartFrame>
  );
}

// ── Release scatter ─────────────────────────────────────────────────────────

export interface ReleasePoint {
  lateral: number;
  height: number;
  pressure: boolean;
}

/**
 * Release points in the frontal plane, split into clean and pressured. Two
 * series only, from the all-pairs-safe slots, with the 1σ and 2σ radii drawn as
 * rings around the athlete's own mean release point.
 */
export function ReleaseScatter({
  points,
  centre,
  sigma,
  height = 280,
}: {
  points: ReleasePoint[];
  centre: { lateral: number; height: number };
  sigma: number;
  height?: number;
}) {
  const clean = points.filter((p) => !p.pressure);
  const pressured = points.filter((p) => p.pressure);
  return (
    <ChartFrame height={height}>
      <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis
          type="number"
          dataKey="lateral"
          name="Lateral from midline"
          unit=" in"
          {...AXIS_PROPS}
          domain={['dataMin - 1', 'dataMax + 1']}
        />
        <YAxis
          type="number"
          dataKey="height"
          name="Release height"
          unit=" in"
          {...AXIS_PROPS}
          width={46}
          domain={['dataMin - 1', 'dataMax + 1']}
        />
        <ZAxis range={[26, 26]} />
        <Tooltip content={<QbTooltip precision={1} />} cursor={{ strokeDasharray: '3 3', stroke: AXIS }} />
        <Legend content={({ payload }) => legendContent(payload as never)} />
        {[1, 2].map((k) => (
          <ReferenceArea
            key={k}
            x1={centre.lateral - sigma * k}
            x2={centre.lateral + sigma * k}
            y1={centre.height - sigma * k}
            y2={centre.height + sigma * k}
            stroke={ACCENT}
            strokeOpacity={0.35}
            strokeDasharray="3 3"
            fill={ACCENT}
            fillOpacity={k === 1 ? 0.05 : 0.02}
          />
        ))}
        <Scatter name="Clean pocket" data={clean} fill={SERIES[0]} fillOpacity={0.75} isAnimationActive={false} />
        <Scatter name="Under pressure" data={pressured} fill={SERIES[1]} fillOpacity={0.85} shape="triangle" isAnimationActive={false} />
      </ScatterChart>
    </ChartFrame>
  );
}

// ── Stacked spans ───────────────────────────────────────────────────────────

export interface StackRow {
  label: string;
  observe: number;
  orient: number;
  decide: number;
  act: number;
}

/**
 * The OODA partition as a stacked bar. An ordinal ramp — one hue, monotone
 * lightness — because the four spans are ordered stages of one loop, not four
 * unrelated categories, and a 2px surface gap keeps the segments legible.
 */
export function OodaStack({
  data,
  ramp,
  height = 170,
  layout = 'vertical',
}: {
  data: StackRow[];
  ramp: readonly string[];
  height?: number;
  layout?: 'horizontal' | 'vertical';
}) {
  const vertical = layout === 'vertical';
  const keys = [
    { key: 'observe', name: 'Observe' },
    { key: 'orient', name: 'Orient' },
    { key: 'decide', name: 'Decide' },
    { key: 'act', name: 'Act' },
  ];
  return (
    <ChartFrame height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 8, right: 16, bottom: 4, left: vertical ? 8 : 0 }} barCategoryGap="30%">
        <CartesianGrid stroke={GRID} vertical={vertical} horizontal={!vertical} />
        {vertical ? (
          <>
            <XAxis type="number" unit=" ms" {...AXIS_PROPS} />
            <YAxis type="category" dataKey="label" {...AXIS_PROPS} width={112} interval={0} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" {...AXIS_PROPS} interval={0} />
            <YAxis unit=" ms" {...AXIS_PROPS} width={52} />
          </>
        )}
        <Tooltip content={<QbTooltip unit="ms" precision={0} />} cursor={{ fill: 'rgb(255 255 255 / 0.04)' }} />
        <Legend
          content={() => legendContent(keys.map((entry, index) => ({ value: entry.name, color: ramp[index] })))}
        />
        {keys.map((entry, index) => (
          <Bar
            key={entry.key}
            dataKey={entry.key}
            name={entry.name}
            stackId="ooda"
            fill={ramp[index]}
            stroke="#0f1318"
            strokeWidth={2}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartFrame>
  );
}

// ── Dot plot ────────────────────────────────────────────────────────────────

/**
 * Ordered categories of a continuous measure.
 *
 * A bar chart has to start at zero, and for a quantity like ball speed — where
 * every value sits between 50 and 60 mph — that draws four near-identical bars
 * and hides the comparison being asked for. A dot plot is the honest form: the
 * axis can start where the data does because a dot encodes position, not area.
 */
export function DotPlot({
  rows,
  unit,
  precision = 1,
  height = 170,
  colorIndex = 0,
  name,
}: {
  rows: { label: string; value: number | null }[];
  unit?: string;
  precision?: number;
  height?: number;
  colorIndex?: number;
  name: string;
}) {
  const colour = seriesColor(colorIndex);
  return (
    <ChartFrame height={height}>
      <LineChart data={rows} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...AXIS_PROPS} interval={0} />
        <YAxis {...AXIS_PROPS} width={46} domain={['dataMin - 1', 'dataMax + 1']} />
        <Tooltip content={<QbTooltip unit={unit} precision={precision} />} cursor={{ stroke: AXIS, strokeDasharray: '3 3' }} />
        <Line
          type="linear"
          dataKey="value"
          name={name}
          stroke={colour}
          strokeWidth={1.5}
          strokeOpacity={0.45}
          dot={{ r: 5, fill: colour, stroke: '#0f1318', strokeWidth: 2 }}
          activeDot={{ r: 7, stroke: '#0f1318', strokeWidth: 2 }}
          isAnimationActive={false}
          connectNulls={false}
        />
      </LineChart>
    </ChartFrame>
  );
}

// ── Signed deltas ───────────────────────────────────────────────────────────

export interface DeltaRow {
  label: string;
  delta: number;
  reps?: number;
}

/**
 * Signed differences drawn from a zero line, warm for one sign and cool for the
 * other. This is the right form when every absolute value sits far from zero —
 * plotting the levels themselves as bars from a zero baseline would draw seven
 * near-identical bars and hide the only thing being asked about.
 */
export function DeltaBars({
  rows,
  unit,
  precision = 0,
  height = 250,
  worseWhen = 'positive',
}: {
  rows: DeltaRow[];
  unit?: string;
  precision?: number;
  height?: number;
  worseWhen?: 'positive' | 'negative';
}) {
  return (
    <ChartFrame height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, bottom: 4, left: 8 }} barCategoryGap="26%">
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" unit={unit ? ` ${unit}` : ''} {...AXIS_PROPS} />
        <YAxis type="category" dataKey="label" {...AXIS_PROPS} width={132} interval={0} />
        <Tooltip
          content={<QbTooltip unit={unit} precision={precision} extra={(row) => `${row.reps ?? 0} reps match`} />}
          cursor={{ fill: 'rgb(255 255 255 / 0.04)' }}
        />
        <ReferenceLine x={0} stroke={AXIS} />
        <Bar dataKey="delta" name="Difference" radius={[0, 3, 3, 0]} isAnimationActive={false}>
          {rows.map((row) => {
            const worse = worseWhen === 'positive' ? row.delta > 0 : row.delta < 0;
            return <Cell key={row.label} fill={worse ? SERIES[1] : SERIES[2]} />;
          })}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

// ── Distribution ────────────────────────────────────────────────────────────

export interface HistogramBin {
  label: string;
  bin: number;
  count: number;
  inBand?: boolean;
}

/** A distribution with the target band shaded, for metrics that have a window. */
export function Histogram({
  bins,
  unit,
  band,
  height = 160,
  colorIndex = 0,
}: {
  bins: HistogramBin[];
  unit?: string;
  band?: [number, number] | undefined;
  height?: number;
  colorIndex?: number;
}) {
  return (
    <ChartFrame height={height}>
      <BarChart data={bins} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} barCategoryGap="12%">
        <CartesianGrid stroke={GRID} vertical={false} />
        {band && <ReferenceArea x1={band[0]} x2={band[1]} fill={ACCENT} fillOpacity={0.07} stroke="none" />}
        <XAxis dataKey="bin" type="number" domain={['dataMin', 'dataMax']} unit={unit ? ` ${unit}` : ''} {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={34} />
        <Tooltip content={<QbTooltip unit="reps" precision={0} labelPrefix="" />} cursor={{ fill: 'rgb(255 255 255 / 0.04)' }} />
        <Bar dataKey="count" name="Reps" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {bins.map((entry) => (
            <Cell key={entry.label} fill={entry.inBand === false ? INK_2 : seriesColor(colorIndex)} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

// ── Dose-response scatter with fit ──────────────────────────────────────────

export function ScatterWithFit({
  points,
  xName,
  yName,
  xUnit,
  yUnit,
  fit,
  height = 220,
  colorIndex = 0,
}: {
  points: { x: number; y: number; label?: string }[];
  xName: string;
  yName: string;
  xUnit?: string;
  yUnit?: string;
  fit?: { slope: number; intercept: number } | null;
  height?: number;
  colorIndex?: number;
}) {
  const xs = points.map((p) => p.x);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const fitLine = fit
    ? [
        { x: min, y: fit.intercept + fit.slope * min },
        { x: max, y: fit.intercept + fit.slope * max },
      ]
    : [];
  return (
    <ChartFrame height={height}>
      <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" dataKey="x" name={xName} unit={xUnit ? ` ${xUnit}` : ''} {...AXIS_PROPS} domain={['dataMin - 1', 'dataMax + 1']} />
        <YAxis type="number" dataKey="y" name={yName} unit={yUnit ? ` ${yUnit}` : ''} {...AXIS_PROPS} width={46} domain={['auto', 'auto']} />
        <ZAxis range={[34, 34]} />
        <Tooltip content={<QbTooltip precision={1} />} cursor={{ strokeDasharray: '3 3', stroke: AXIS }} />
        <Scatter name={yName} data={points} fill={seriesColor(colorIndex)} fillOpacity={0.8} isAnimationActive={false} />
        {fitLine.length === 2 && (
          <Scatter
            name="Least-squares fit"
            data={fitLine}
            line={{ stroke: INK_2, strokeWidth: 1.5, strokeDasharray: '4 3' }}
            shape={() => <Dot r={0} />}
            isAnimationActive={false}
          />
        )}
        <Legend content={({ payload }) => legendContent(payload as never)} />
      </ScatterChart>
    </ChartFrame>
  );
}

// ── Small area chart, for rolling views ─────────────────────────────────────

export function RollingArea({
  data,
  unit,
  precision = 0,
  height = 150,
  colorIndex = 0,
  name,
}: {
  data: { label: string; value: number | null }[];
  unit?: string;
  precision?: number;
  height?: number;
  colorIndex?: number;
  name: string;
}) {
  const colour = seriesColor(colorIndex);
  return (
    <ChartFrame height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id={`fill-${colorIndex}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity={0.30} />
            <stop offset="100%" stopColor={colour} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...AXIS_PROPS} minTickGap={30} />
        <YAxis {...AXIS_PROPS} width={44} domain={['auto', 'auto']} />
        <Tooltip content={<QbTooltip unit={unit} precision={precision} />} cursor={{ stroke: AXIS }} />
        <Area
          type="monotone"
          dataKey="value"
          name={name}
          stroke={colour}
          strokeWidth={2}
          fill={`url(#fill-${colorIndex})`}
          isAnimationActive={false}
          connectNulls
        />
      </AreaChart>
    </ChartFrame>
  );
}

/** Plain single-series line, for the compact panels. */
export function MiniLine({
  data,
  unit,
  precision = 0,
  height = 130,
  colorIndex = 0,
  name,
}: {
  data: { label: string; value: number | null }[];
  unit?: string;
  precision?: number;
  height?: number;
  colorIndex?: number;
  name: string;
}) {
  return (
    <ChartFrame height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...AXIS_PROPS} minTickGap={24} />
        <YAxis {...AXIS_PROPS} width={44} domain={['auto', 'auto']} />
        <Tooltip content={<QbTooltip unit={unit} precision={precision} />} cursor={{ stroke: AXIS }} />
        <Line
          type="monotone"
          dataKey="value"
          name={name}
          stroke={seriesColor(colorIndex)}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, stroke: '#0f1318', strokeWidth: 2 }}
          isAnimationActive={false}
          connectNulls
        />
      </LineChart>
    </ChartFrame>
  );
}

export { INK_2, INK_3 };
