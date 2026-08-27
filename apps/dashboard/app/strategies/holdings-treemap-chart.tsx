"use client";

// The holdings-performance Treemap (V2 StrategiesViz.tsx HoldingsTreemap
// inner chart). This module is the ONLY recharts import for the treemap and
// is loaded exclusively via React.lazy from strategies-viz.tsx AFTER the
// client-side data fetch resolves — the Worker SSR never evaluates it.
//
// The treemap keeps V2's dark-canvas look inside its card: cell labels are
// white with a dark paint-order stroke, so the dark surface is part of the
// design (gain alphas were validated against it).

import { ResponsiveContainer, Treemap } from "recharts";
import { DARK, INK } from "./strategy-theme";

export interface TreemapLeaf {
  name: string;
  size: number;
  fill: string;
  label: string;
  stratColor: string;
}

export interface TreemapGroup {
  name: string;
  stratColor: string;
  children: TreemapLeaf[];
}

// recharts injects layout geometry into the custom content element; its prop
// shape is untyped upstream, mirrored from V2 verbatim.
function TreeCell(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  depth?: number;
  name?: string;
  fill?: string;
  stratColor?: string;
  label?: string;
}) {
  const { x = 0, y = 0, width = 0, height = 0, depth, name, fill, stratColor, label } = props;
  if (depth === 1) {
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={1.5}
        />
        {width > 46 && height > 14 && (
          <>
            <rect
              x={x + 3}
              y={y + 2.5}
              width={(name?.length ?? 4) * 6.2 + 8}
              height={13}
              rx={2}
              fill="rgba(3,6,12,0.55)"
            />
            <text
              x={x + 7}
              y={y + 12.5}
              fontSize={9.5}
              fontWeight={800}
              fill={stratColor ?? INK.ink2}
            >
              {name}
            </text>
          </>
        )}
      </g>
    );
  }
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="rgba(255,255,255,0.14)"
        strokeWidth={1}
      />
      {width > 36 && height > 24 && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 1}
            textAnchor="middle"
            fontSize={Math.min(12, width / 4)}
            fontWeight={800}
            fill="#fff"
            style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.5)", strokeWidth: 2.4 }}
          >
            {name}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 12}
            textAnchor="middle"
            fontSize={10}
            fontWeight={700}
            fill="#fff"
            style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.5)", strokeWidth: 2.4 }}
          >
            {label}
          </text>
        </>
      )}
    </g>
  );
}

export default function TreemapChart({ data }: { data: TreemapGroup[] }) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <Treemap
        data={data}
        dataKey="size"
        aspectRatio={4 / 3}
        stroke={DARK.page}
        isAnimationActive={false}
        content={<TreeCell />}
      />
    </ResponsiveContainer>
  );
}
