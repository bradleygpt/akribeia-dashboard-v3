"use client";

// The V2 Monte Carlo percentile cone (PortfolioTab.tsx fan chart) on the V3
// light research surface. This module is the ONLY place the portfolio page
// touches recharts, and it is loaded exclusively via React.lazy from
// portfolio-workbench.tsx AFTER the client-side simulation exists — the
// Worker SSR never evaluates recharts (the strategies-hub-chart pattern).

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { McFanPoint } from "./monte-carlo";

// Recharts consumes JS color strings (SVG attributes don't resolve var()), so
// the globals.css tokens are mirrored here as hex — the CHART_LIGHT pattern.
const CHART = {
  ink: "#101914",
  muted: "#68746c",
  line: "#ccd2c7",
  grid: "#dfe3d8",
  card: "#f9faef",
  cone: "#466c18",
} as const;

const money = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export default function MonteCarloFanChart({
  fan,
  horizonDays,
  totalValue,
}: {
  fan: McFanPoint[];
  horizonDays: number;
  totalValue: number;
}) {
  const rows = fan.map((point) => ({
    day: point.day,
    p50: point.p50,
    base: point.p5,
    outer: point.p95 - point.p5,
    base2: point.p25,
    inner: point.p75 - point.p25,
  }));
  return (
    <ResponsiveContainer width="100%" height={340}>
      <AreaChart data={rows} margin={{ top: 12, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis
          dataKey="day"
          type="number"
          domain={[0, horizonDays]}
          tick={{ fill: CHART.muted, fontSize: 11 }}
          stroke={CHART.line}
          tickLine={false}
          tickFormatter={(day: number) => `${day}d`}
          minTickGap={36}
        />
        <YAxis
          tick={{ fill: CHART.muted, fontSize: 11 }}
          stroke={CHART.line}
          tickLine={false}
          width={64}
          tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`}
          domain={["auto", "auto"]}
        />
        <Tooltip
          contentStyle={{
            background: CHART.card,
            border: `1px solid ${CHART.line}`,
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: CHART.ink }}
          labelFormatter={(day) => `Day ${String(day)}`}
          formatter={(value: number, name: string) =>
            name === "Median" ? [money(value), "Median"] : [null, null]
          }
        />
        <ReferenceLine
          y={totalValue}
          stroke={CHART.muted}
          strokeDasharray="4 4"
          label={{ value: "Start", fill: CHART.muted, fontSize: 10, position: "insideLeft" }}
        />
        {/* 5–95 band (transparent base + filled span), then 25–75 band, then median */}
        <Area
          type="monotone"
          dataKey="base"
          stackId="o"
          stroke="none"
          fill="transparent"
          isAnimationActive={false}
          legendType="none"
        />
        <Area
          type="monotone"
          dataKey="outer"
          stackId="o"
          stroke="none"
          fill={CHART.cone}
          fillOpacity={0.1}
          isAnimationActive={false}
          name="5–95th"
        />
        <Area
          type="monotone"
          dataKey="base2"
          stackId="i"
          stroke="none"
          fill="transparent"
          isAnimationActive={false}
          legendType="none"
        />
        <Area
          type="monotone"
          dataKey="inner"
          stackId="i"
          stroke="none"
          fill={CHART.cone}
          fillOpacity={0.2}
          isAnimationActive={false}
          name="25–75th"
        />
        <Area
          type="monotone"
          dataKey="p50"
          stroke={CHART.cone}
          strokeWidth={2}
          fill="none"
          dot={false}
          name="Median"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
