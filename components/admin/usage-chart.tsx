"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Daily question volume, trailing ~31 days.
 *
 * Single series (every consultant combined), so this is a sequential job, one
 * hue (brass), no legend box: the card title already says what is plotted.
 * Bars rather than a line: the underlying data is a discrete daily count, and
 * a line would imply an interpolated value between days that was never asked.
 *
 * Built as inline SVG rather than a charting library. One chart, one page,
 * and every visual rule (rounded data-ends, hairline gridlines, a11y hover)
 * is a few dozen lines here versus a dependency plus its own escape hatches.
 */
export function UsageChart({
  data,
}: {
  data: { date: string; count: number }[];
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const gradientId = useId();

  const width = 720;
  const height = 220;
  const padTop = 16;
  const padBottom = 28;
  const padLeft = 34;
  const padRight = 4;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const ticks = niceTicks(maxCount);
  const yMax = ticks[ticks.length - 1];
  const peakIndex = data.reduce(
    (best, d, i) => (d.count > data[best].count ? i : best),
    0,
  );

  const bandW = plotW / data.length;
  const barW = Math.min(24, bandW * 0.62);
  const gap = 2; // the surface gap between adjacent bars, per the mark spec

  const yFor = (count: number) => padTop + plotH * (1 - count / yMax);

  // Sparse x labels: first, last, and evenly spaced in between, so ~31 dates
  // never collide. Every date stays reachable via the tooltip regardless.
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Questions asked per day, ${data[0]?.date} to ${data[data.length - 1]?.date}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brass)" />
            <stop offset="100%" stopColor="var(--color-brass)" stopOpacity="0.75" />
          </linearGradient>
        </defs>

        {ticks.map((value) => {
          const y = padTop + plotH * (1 - value / yMax);
          return (
            <g key={value}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              <text
                x={padLeft - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-slate-light text-[9px] tabular-nums"
              >
                {value}
              </text>
            </g>
          );
        })}

        <line
          x1={padLeft}
          x2={width - padRight}
          y1={padTop + plotH}
          y2={padTop + plotH}
          stroke="var(--color-border-strong)"
          strokeWidth={1}
        />

        {data.map((d, i) => {
          const x = padLeft + i * bandW + (bandW - barW) / 2;
          const barH = Math.max(0, plotH * (d.count / yMax));
          const y = yFor(d.count);
          const isHovered = hovered === i;
          const isPeak = i === peakIndex && d.count > 0;

          return (
            <g key={d.date}>
              {barH > 0 ? (
                <path
                  d={roundedTopBar(x, y, barW, barH, 4)}
                  fill={isHovered ? "var(--color-brass-strong)" : `url(#${gradientId})`}
                />
              ) : null}

              {isPeak ? (
                <text
                  x={x + barW / 2}
                  y={y - 5}
                  textAnchor="middle"
                  className="fill-ink text-[9px] font-medium tabular-nums"
                >
                  {d.count}
                </text>
              ) : null}

              {i % labelEvery === 0 || i === data.length - 1 ? (
                <text
                  x={x + barW / 2}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-slate-light text-[9px]"
                >
                  {shortDate(d.date)}
                </text>
              ) : null}

              {/* Hit target spans the full band, not just the visible bar, so
                  the pointer only has to be close, per the interaction spec. */}
              <rect
                x={padLeft + i * bandW}
                y={padTop}
                width={Math.max(0, bandW - gap)}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`${d.count} question${d.count === 1 ? "" : "s"} on ${formatFullDate(d.date)}`}
                onPointerEnter={() => setHovered(i)}
                onPointerLeave={() => setHovered((current) => (current === i ? null : current))}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered((current) => (current === i ? null : current))}
                className="outline-none"
              />
            </g>
          );
        })}
      </svg>

      {hovered !== null && data[hovered] ? (
        <div
          className={cn(
            "pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-raised",
          )}
          style={{
            left: `${((hovered + 0.5) / data.length) * 100}%`,
            top: `${(yFor(data[hovered].count) / height) * 100}%`,
            marginTop: "-6px",
          }}
        >
          <p className="font-semibold text-ink tabular-nums">
            {data[hovered].count} question{data[hovered].count === 1 ? "" : "s"}
          </p>
          <p className="text-slate">{formatFullDate(data[hovered].date)}</p>
        </div>
      ) : null}
    </div>
  );
}

/** Rounded top corners, square baseline, per the bar mark spec. */
function roundedTopBar(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, w / 2, h);
  return `
    M ${x} ${y + h}
    L ${x} ${y + radius}
    Q ${x} ${y} ${x + radius} ${y}
    L ${x + w - radius} ${y}
    Q ${x + w} ${y} ${x + w} ${y + radius}
    L ${x + w} ${y + h}
    Z
  `;
}

/**
 * Clean y-axis ticks from 0 up past maxValue, per the mark spec ("round to
 * clean numbers"). A quartile split of an arbitrary rounded max produces
 * ticks like 13 and 38; this produces 0/10/20/30/40 instead.
 */
function niceTicks(maxValue: number, targetCount = 4): number[] {
  if (maxValue <= 0) return [0, 5];

  const rawStep = maxValue / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceStep =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
    magnitude;

  const ticks: number[] = [];
  for (let v = 0; v <= maxValue; v += niceStep) ticks.push(Math.round(v));
  if (ticks[ticks.length - 1] < maxValue) {
    ticks.push(ticks[ticks.length - 1] + niceStep);
  }
  return ticks;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatFullDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
