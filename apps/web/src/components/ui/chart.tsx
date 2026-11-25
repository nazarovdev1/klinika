'use client';

import { useEffect, useId, useRef, useState } from 'react';

export interface TrendPoint {
  /** Short axis label, e.g. "24.11". */
  label: string;
  /** Full label for the tooltip and the screen-reader table. */
  title: string;
  value: number;
  /** Same weekday of the previous period. */
  before: number;
}

const PAD = { l: 64, r: 22, t: 20, b: 32 };
const HEIGHT = 300;

/** One measure over time (area + line) against the previous period (grey line). Drawn in real pixels. */
export function TrendChart({
  data,
  format,
  axisFormat = format,
  label,
  now,
  before,
}: {
  data: TrendPoint[];
  format: (n: number) => string;
  axisFormat?: (n: number) => string;
  label: string;
  /** Legend names of the two lines. */
  now: string;
  before: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const gradient = useId();
  const [w, setW] = useState(0);
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setW(e.contentRect.width);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, []);

  const max = Math.max(1, ...data.flatMap((d) => [d.value, d.before]));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const iw = Math.max(w - PAD.l - PAD.r, 1);
  const base = HEIGHT - PAD.b;
  const x = (i: number) => PAD.l + (data.length > 1 ? (i / (data.length - 1)) * iw : iw / 2);
  const y = (v: number) => base - (v / top) * (base - PAD.t);
  const line = smooth(data.map((d, i) => [x(i), y(d.value)]));
  const ghost = smooth(data.map((d, i) => [x(i), y(d.before)]));
  const every = Math.max(1, Math.ceil((data.length * 56) / iw));
  const last = data.length - 1;
  const peak = data.reduce((m, d, i) => (d.value > (data[m]?.value ?? 0) ? i : m), 0);
  const active = at === null ? undefined : data[at];

  return (
    <figure>
      <figcaption className="mb-1 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2">
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-[3px] w-5 rounded-full bg-primary" />
          {now}
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-[2px] w-5 rounded-full bg-[#8792ad]" />
          {before}
        </span>
      </figcaption>
      <div ref={box} className="relative" style={{ height: HEIGHT }}>
        {w > 0 && (
          <svg
            width={w}
            height={HEIGHT}
            role="img"
            aria-label={label}
            tabIndex={0}
            className="block touch-pan-y"
            onPointerMove={(e) => {
              const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
              setAt(Math.min(last, Math.max(0, Math.round(((px - PAD.l) / iw) * last))));
            }}
            onPointerLeave={() => {
              setAt(null);
            }}
            onBlur={() => {
              setAt(null);
            }}
            onKeyDown={(e) => {
              const move = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
              if (!move) return;
              e.preventDefault();
              setAt(Math.min(last, Math.max(0, (at ?? last) + move)));
            }}
          >
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--primary)" stopOpacity="0.2" />
                <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((tk) => (
              <g key={tk}>
                <line
                  x1={PAD.l}
                  x2={w - PAD.r}
                  y1={y(tk)}
                  y2={y(tk)}
                  stroke="var(--line)"
                  strokeDasharray={tk === 0 ? undefined : '2 5'}
                />
                <text
                  x={PAD.l - 12}
                  y={y(tk) + 4}
                  textAnchor="end"
                  fontSize="12"
                  fill="var(--ink-2)"
                  className="num"
                >
                  {axisFormat(tk)}
                </text>
              </g>
            ))}
            {data.map(
              (d, i) =>
                (last - i) % every === 0 && (
                  <text
                    key={d.title}
                    x={x(i)}
                    y={HEIGHT - 8}
                    textAnchor="middle"
                    fontSize="12"
                    fill="var(--ink-2)"
                    className="num"
                  >
                    {d.label}
                  </text>
                ),
            )}
            <path
              d={`${line} L${String(x(last))},${String(base)} L${String(x(0))},${String(base)} Z`}
              fill={`url(#${gradient})`}
            />
            <path d={ghost} fill="none" stroke="#8792ad" strokeWidth="1.5" />
            <path
              d={line}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {active && at !== null ? (
              <>
                <line x1={x(at)} x2={x(at)} y1={PAD.t} y2={base} stroke="#8792ad" />
                <circle
                  cx={x(at)}
                  cy={y(active.before)}
                  r="4"
                  fill="#8792ad"
                  stroke="var(--surface)"
                  strokeWidth="2"
                />
                <circle
                  cx={x(at)}
                  cy={y(active.value)}
                  r="6"
                  fill="var(--primary)"
                  stroke="var(--surface)"
                  strokeWidth="2.5"
                />
              </>
            ) : (
              data[peak] && (
                <>
                  <circle
                    cx={x(peak)}
                    cy={y(data[peak].value)}
                    r="5"
                    fill="var(--primary)"
                    stroke="var(--surface)"
                    strokeWidth="2.5"
                  />
                  <text
                    x={x(peak)}
                    y={y(data[peak].value) - 11}
                    textAnchor={peak === 0 ? 'start' : peak === last ? 'end' : 'middle'}
                    fontSize="13"
                    fontWeight="600"
                    fill="var(--ink)"
                    className="num"
                    paintOrder="stroke"
                    stroke="var(--surface)"
                    strokeWidth="4"
                  >
                    {axisFormat(data[peak].value)}
                  </text>
                </>
              )
            )}
          </svg>
        )}
        {active && at !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 w-[190px] rounded-control bg-ink px-3 py-2.5 text-[13px] text-white"
            style={{ left: Math.max(0, x(at) > w / 2 ? x(at) - 206 : x(at) + 16) }}
          >
            <p className="text-white/75">{active.title}</p>
            <p className="num mt-0.5 text-[17px] font-semibold">{format(active.value)}</p>
            <p className="num mt-1 text-white/75">
              {before}: {format(active.before)}
            </p>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th />
            <th>{now}</th>
            <th>{before}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.title}>
              <th>{d.title}</th>
              <td>{format(d.value)}</td>
              <td>{format(d.before)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Ranked magnitudes with the exact figure and share beside each bar. */
export function RankBars({
  items,
  format,
}: {
  items: { id: string; label: string; value: number }[];
  format: (n: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const sum = items.reduce((s, i) => s + Math.max(i.value, 0), 0);
  return (
    <ul className="space-y-3.5">
      {items.map((i) => (
        <li key={i.id}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[14px]">
            <span className="min-w-0 truncate">{i.label}</span>
            <span className="num whitespace-nowrap">
              <b className="font-semibold">{format(i.value)}</b>
              <span className="ml-2 inline-block w-9 text-right text-[13px] text-ink-2">
                {sum > 0 ? Math.round((Math.max(i.value, 0) / sum) * 100) : 0}%
              </span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-bg">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${String((Math.max(i.value, 0) / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Monotone cubic path: smooth, and never overshoots the real values. */
function smooth(p: [number, number][]): string {
  const at = (i: number): [number, number] => p[i] ?? [0, 0];
  const n = p.length;
  if (n === 0) return '';
  const slope = (i: number) => {
    const [x0, y0] = at(i);
    const [x1, y1] = at(i + 1);
    return (y1 - y0) / (x1 - x0 || 1);
  };
  const tangent = (i: number) => {
    if (i === 0) return n > 1 ? slope(0) : 0;
    if (i === n - 1) return slope(n - 2);
    const a = slope(i - 1);
    const b = slope(i);
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  let d = `M${at(0).join(',')}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = at(i);
    const [x1, y1] = at(i + 1);
    const h = (x1 - x0) / 3;
    d += ` C${[x0 + h, y0 + tangent(i) * h, x1 - h, y1 - tangent(i + 1) * h, x1, y1].join(',')}`;
  }
  return d;
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}
