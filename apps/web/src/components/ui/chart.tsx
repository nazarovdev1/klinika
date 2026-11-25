/** Plain SVG bar chart for real series (no decoration): gridlines, value axis, labelled bars. */
export function BarChart({
  data,
  format = String,
  height = 180,
  label,
}: {
  data: { label: string; value: number }[];
  format?: (n: number) => string;
  height?: number;
  label: string;
}) {
  const w = 560;
  const pad = { l: 56, r: 8, t: 8, b: 24 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = niceStep(max / 3);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const bw = Math.min(28, (iw / Math.max(data.length, 1)) * 0.6);
  const y = (v: number) => pad.t + ih - (v / top) * ih;
  return (
    <svg
      viewBox={`0 0 ${String(w)} ${String(height)}`}
      role="img"
      aria-label={label}
      className="h-auto w-full"
    >
      {ticks.map((tk) => (
        <g key={tk}>
          <line x1={pad.l} x2={w - pad.r} y1={y(tk)} y2={y(tk)} stroke="#d8dde0" strokeWidth="1" />
          <text
            x={pad.l - 8}
            y={y(tk) + 4}
            textAnchor="end"
            fontSize="11"
            fill="#4c6272"
            className="num"
          >
            {format(tk)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = pad.l + (iw / data.length) * (i + 0.5);
        return (
          <g key={d.label + String(i)}>
            <rect
              x={cx - bw / 2}
              y={y(d.value)}
              width={bw}
              height={pad.t + ih - y(d.value)}
              fill="#0b6e69"
              rx="2"
            >
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
            {(data.length <= 8 || i % 2 === 0) && (
              <text
                x={cx}
                y={height - 6}
                textAnchor="middle"
                fontSize="11"
                fill="#4c6272"
                className="num"
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}
