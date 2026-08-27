"use client";

// The growth-of-100 hero LineChart (V2 StrategiesViz.tsx StrategiesHub inner
// chart). This module is the ONLY place the hub touches recharts, and it is
// loaded exclusively via React.lazy from strategies-viz.tsx AFTER the
// client-side data fetch resolves — the Worker SSR never evaluates it.
//
// Chart chrome is adapted from V2's ChartFrame to the V3 light research
// surface (recharts consumes JS color strings, so the globals.css tokens are
// mirrored as hex in strategy-theme.ts CHART_LIGHT).

import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BENCH_SERIES, CHART_LIGHT, ENTITY, PAPER_SERIES } from "./strategy-theme";

export interface HubSeriesDef {
  slug: string;
  name: string;
  color: string;
  dashed: boolean;
}

export type HubRow = Record<string, number | string | null>;

const axisProps = {
  tick: { fill: CHART_LIGHT.muted, fontSize: 11 },
  stroke: CHART_LIGHT.line,
  tickLine: false as const,
  axisLine: { stroke: CHART_LIGHT.line },
};

const gridProps = {
  stroke: CHART_LIGHT.grid,
  vertical: false as const,
};

const tooltipProps = {
  contentStyle: {
    background: CHART_LIGHT.card,
    border: `1px solid ${CHART_LIGHT.line}`,
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: CHART_LIGHT.ink },
  itemStyle: { paddingTop: 0, paddingBottom: 0 },
};

export default function HubChart({
  rows,
  series,
  hasSpy,
  win,
  margin,
  yAxisWidth,
  height,
  onWindowChange,
}: {
  rows: HubRow[];
  series: HubSeriesDef[];
  hasSpy: boolean;
  win: [number, number];
  margin: { top: number; right: number; bottom: number; left: number };
  yAxisWidth: number;
  height: number;
  onWindowChange: (win: [number, number]) => void;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={margin}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="date" {...axisProps} minTickGap={60} />
        <YAxis
          scale="log"
          domain={["auto", "auto"]}
          allowDataOverflow
          {...axisProps}
          width={yAxisWidth}
          tickFormatter={(v: number) =>
            v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v))
          }
        />
        <Tooltip
          {...tooltipProps}
          formatter={(v: number, n) => [v != null ? Math.round(v).toLocaleString() : "—", n]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s) => (
          <Line
            key={s.slug}
            type="monotone"
            dataKey={s.slug}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            strokeOpacity={s.dashed ? PAPER_SERIES.opacity : 1}
            strokeDasharray={s.dashed ? PAPER_SERIES.dash : undefined}
            dot={false}
            connectNulls
          />
        ))}
        {hasSpy && (
          <Line
            type="monotone"
            dataKey="SPY"
            name="SPY"
            stroke={ENTITY.benchmark}
            strokeWidth={BENCH_SERIES.width}
            strokeDasharray={BENCH_SERIES.dash}
            dot={false}
            connectNulls
          />
        )}
        <Brush
          dataKey="date"
          height={22}
          travellerWidth={8}
          startIndex={win[0]}
          endIndex={win[1]}
          stroke={CHART_LIGHT.muted}
          fill={CHART_LIGHT.card}
          onChange={(r: { startIndex?: number; endIndex?: number }) => {
            if (r && r.startIndex != null && r.endIndex != null) {
              onWindowChange([r.startIndex, r.endIndex]);
            }
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
