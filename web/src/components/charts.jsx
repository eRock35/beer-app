import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTooltip } from './ui.jsx';

/**
 * All charts here are single-series: magnitude or shape, never identity. That
 * is why none of them carry a legend — the title names the one series — and why
 * they all use one hue rather than a categorical ramp.
 *
 * Every SVG is drawn in a fixed viewBox and stretched to the container width,
 * so the same chart reads on a 360px phone and a 1280px desktop. Tooltips work
 * on tap as well as hover.
 */

/** Rounded far end only, so the bar stays anchored to its baseline. */
function hBarPath(x, y, w, h, r = 4) {
  const radius = Math.max(0, Math.min(r, w, h / 2));
  if (radius === 0) return `M${x},${y}h${w}v${h}h${-w}z`;
  return [
    `M${x},${y}`,
    `h${w - radius}`,
    `a${radius},${radius} 0 0 1 ${radius},${radius}`,
    `v${h - radius * 2}`,
    `a${radius},${radius} 0 0 1 ${-radius},${radius}`,
    `h${-(w - radius)}`,
    'z',
  ].join('');
}

/**
 * The palate radar — the average shape of how this person scores, not a
 * ranking. Five axes, one polygon.
 */
export function PalateRadar({ palate }) {
  const { bind, node } = useTooltip();
  const points = palate.filter((p) => p.average != null);
  const titleId = useId();

  if (points.length < 3) {
    return (
      <p className="secondary" style={{ fontSize: 14 }}>
        Score three or more beers across all five axes and your palate shape appears here.
      </p>
    );
  }

  // Wider than tall: the axis labels sit outside the web and need the room, or
  // the east and west ones clip against the viewBox edge.
  const width = 360;
  const height = 270;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 84;
  const max = 10;

  const angleFor = (i) => (Math.PI * 2 * i) / points.length - Math.PI / 2;
  const coord = (i, value) => {
    const a = angleFor(i);
    const r = (value / max) * radius;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };

  const polygon = points.map((p, i) => coord(i, p.average).join(',')).join(' ');
  const rings = [2, 4, 6, 8, 10];

  return (
    <>
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={titleId}
        style={{ maxWidth: width, margin: '0 auto' }}
      >
        <title id={titleId}>
          Average score per tasting axis, out of ten: {points.map((p) => `${p.label} ${p.average}`).join(', ')}
        </title>

        {rings.map((ring) => (
          <polygon
            key={ring}
            className="grid-line"
            fill="none"
            points={points.map((_, i) => coord(i, ring).join(',')).join(' ')}
          />
        ))}
        {points.map((p, i) => {
          const [x, y] = coord(i, max);
          return <line key={p.axis} className="grid-line" x1={cx} y1={cy} x2={x} y2={y} />;
        })}

        <polygon
          points={polygon}
          fill="var(--series-1)"
          fillOpacity="0.18"
          stroke="var(--series-1)"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {points.map((p, i) => {
          const [x, y] = coord(i, p.average);
          return (
            <g key={p.axis} className="chart-dot" {...bind(`${p.label}: ${p.average}/10 · ${p.n} beers`)}>
              {/* A 44px-ish invisible hit area around each dot. */}
              <circle cx={x} cy={y} r="16" fill="transparent" />
              <circle cx={x} cy={y} r="4.5" fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth="2" />
            </g>
          );
        })}

        {points.map((p, i) => {
          const a = angleFor(i);
          const lx = cx + Math.cos(a) * (radius + 26);
          const ly = cy + Math.sin(a) * (radius + 22);
          const anchor = Math.abs(Math.cos(a)) < 0.25 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
          return (
            <text
              key={p.axis}
              className="axis-label"
              x={lx}
              y={ly}
              textAnchor={anchor}
              dominantBaseline="middle"
              style={{ fontSize: 11 }}
            >
              {p.label}
              <tspan className="value-label" dx="5" style={{ fontSize: 11 }}>
                {p.average}
              </tspan>
            </text>
          );
        })}
      </svg>
      {node}
    </>
  );
}

/** Style-family counts. Magnitude, so one hue and direct value labels. */
export function StyleBars({ families }) {
  const { bind, node } = useTooltip();
  const titleId = useId();
  const rows = families.filter((f) => f.count > 0).sort((a, b) => b.count - a.count);
  const total = rows.reduce((n, r) => n + r.count, 0);

  if (!rows.length) {
    return <p className="secondary" style={{ fontSize: 14 }}>Nothing logged yet.</p>;
  }

  const max = Math.max(...rows.map((r) => r.count));
  const rowH = 32;
  const gap = 2;
  const labelW = 118;
  const valueW = 40;
  const height = rows.length * (rowH + gap);
  const width = 400;
  const trackW = width - labelW - valueW;

  return (
    <>
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={titleId}
        style={{ maxHeight: height }}
      >
        <title id={titleId}>
          Beers logged per style family: {rows.map((r) => `${r.label} ${r.count}`).join(', ')}
        </title>
        {rows.map((row, i) => {
          const y = i * (rowH + gap);
          const w = Math.max(3, (row.count / max) * trackW);
          const pct = Math.round((row.count / total) * 100);
          return (
            <g key={row.key}>
              <text className="axis-label" x={labelW - 10} y={y + rowH / 2} textAnchor="end" dominantBaseline="middle">
                {row.label}
              </text>
              <rect className="bar-track" x={labelW} y={y + 7} width={trackW} height={rowH - 14} rx="4" />
              <path d={hBarPath(labelW, y + 7, w, rowH - 14, 4)} fill="var(--series-1)" />
              <text className="value-label" x={labelW + trackW + 10} y={y + rowH / 2} dominantBaseline="middle">
                {row.count}
              </text>
              <rect
                className="bar-hit"
                x={0}
                y={y}
                width={width}
                height={rowH}
                {...bind(`${row.label}: ${row.count} beers · ${pct}% of your book`)}
              />
            </g>
          );
        })}
      </svg>
      {node}
    </>
  );
}

/** Average score by month. One line, markers on every point, crosshair on hover or tap. */
export function ScoreTimeline({ timeline }) {
  const [hover, setHover] = useState(null);
  const titleId = useId();
  const wrapRef = useRef(null);
  const points = useMemo(() => timeline.filter((t) => t.averageScore != null), [timeline]);

  // A tap outside the chart clears the crosshair on touch devices.
  useEffect(() => {
    if (hover == null) return undefined;
    const off = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setHover(null);
    };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [hover]);

  if (points.length < 2) {
    return (
      <p className="secondary" style={{ fontSize: 14 }}>
        Log beers across two or more months and the trend line shows up here.
      </p>
    );
  }

  const width = 560;
  const height = 200;
  const pad = { top: 16, right: 16, bottom: 30, left: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const scores = points.map((p) => p.averageScore);
  const lo = Math.max(0, Math.min(...scores) - 6);
  const hi = Math.min(100, Math.max(...scores) + 6);
  const span = Math.max(1, hi - lo);

  const xAt = (i) => pad.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yAt = (v) => pad.top + plotH - ((v - lo) / span) * plotH;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(p.averageScore)}`).join('');
  const ticks = [lo, (lo + hi) / 2, hi].map((v) => Math.round(v));
  const monthLabel = (m) => {
    const d = new Date(`${m}-01T00:00:00Z`);
    const month = d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
    return `${month} ’${String(d.getUTCFullYear()).slice(2)}`;
  };

  return (
    <div style={{ position: 'relative' }} ref={wrapRef}>
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={titleId}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
      >
        <title id={titleId}>
          Average snob score by month: {points.map((p) => `${p.month} ${p.averageScore}`).join(', ')}
        </title>

        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={pad.left} y1={yAt(t)} x2={width - pad.right} y2={yAt(t)} />
            <text className="axis-label" x={pad.left - 8} y={yAt(t)} textAnchor="end" dominantBaseline="middle">
              {t}
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <circle
            key={p.month}
            cx={xAt(i)}
            cy={yAt(p.averageScore)}
            r={hover === i ? 6 : 4}
            fill="var(--series-1)"
            stroke="var(--surface-1)"
            strokeWidth="2"
          />
        ))}

        {hover != null && (
          <line
            className="grid-line"
            x1={xAt(hover)}
            y1={pad.top}
            x2={xAt(hover)}
            y2={pad.top + plotH}
            strokeDasharray="3 3"
          />
        )}

        {points.map((p, i) => (
          <g key={`hit-${p.month}`}>
            {(i === 0 || i === points.length - 1 || points.length <= 6) && (
              <text className="axis-label" x={xAt(i)} y={height - 8} textAnchor="middle">
                {monthLabel(p.month)}
              </text>
            )}
            <rect
              className="bar-hit"
              x={xAt(i) - plotW / (points.length * 2) - 2}
              y={pad.top}
              width={plotW / points.length + 4}
              height={plotH}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(i)}
              onPointerDown={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              aria-label={`${monthLabel(p.month)}: average ${p.averageScore} over ${p.count} beers`}
            />
          </g>
        ))}
      </svg>

      {hover != null && (
        <div
          className="tooltip"
          style={{
            position: 'absolute',
            left: `${(xAt(hover) / width) * 100}%`,
            top: 0,
            transform: `translate(${hover === 0 ? '-10%' : hover === points.length - 1 ? '-90%' : '-50%'}, -8px)`,
          }}
        >
          {monthLabel(points[hover].month)} · <b>{points[hover].averageScore}</b> avg ·{' '}
          {points[hover].count} {points[hover].count === 1 ? 'beer' : 'beers'}
        </div>
      )}
    </div>
  );
}

/** The five axis sliders, rendered as read-only bars on a pour card. */
export function AxisBars({ scores, axes }) {
  const rows = axes.filter((a) => Number.isFinite(scores?.[a.key]));
  if (!rows.length) return null;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map((axis) => {
        const value = scores[axis.key];
        return (
          <div key={axis.key} style={{ display: 'grid', gridTemplateColumns: '86px 1fr 30px', gap: 8, alignItems: 'center' }}>
            <span className="axis-label" style={{ fontSize: 12, color: 'var(--label-2)' }}>{axis.label}</span>
            <div className="progress" style={{ marginTop: 0 }}>
              <div
                className="progress-fill"
                style={{ width: `${(value / 10) * 100}%`, background: 'var(--series-1)' }}
              />
            </div>
            <span className="value-label tabular" style={{ fontSize: 12, textAlign: 'right', color: 'var(--label)' }}>{value}</span>
          </div>
        );
      })}
    </div>
  );
}
