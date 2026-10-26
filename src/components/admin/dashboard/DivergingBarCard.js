import React, { useEffect, useRef, useState } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, LabelList } from 'recharts';
import ChartDataToggle from './ChartDataToggle.js';
import { COLOURS } from '../../../constants/dashboardColours.js';
import { formatNumber, formatPercent } from '../../../utils/numberFormat.js';
import { measureTextWidth } from '../../../utils/dashboard/measureText.js';

// Diverging horizontal bar chart in a card: positive rows extend right (green),
// negative rows extend left (red), from a shared zero baseline. The axis is
// labelled as a percentage of all responses, and each bar carries its share as
// a percentage data label; the tooltip shows the raw count. Rows are plotted
// top→bottom in the order given, so the
// caller controls grouping (e.g. positives first, negatives last → negatives at
// the bottom). Each row needs { name, value, positive } where `value` is the
// non-negative count and `positive` decides the side/colour. `a11y` (see
// ChartDataToggle.js) adds a slim "As raw data table" expand/collapse below
// the chart — the SVG's Tooltip only exposes the raw count on mouse hover;
// the chart itself always stays visible either way.
const DivergingBarCard = ({ title, subtitle, data = [], height, lang = 'en', noDataLabel = '', a11y = null }) => {
  // Y-axis label column has to shrink to fit narrow cards (mobile), or the
  // bar/label area is squeezed to nothing and rows render with no visible bar
  // and no % label at all. Track the card's actual rendered width so the
  // label column is sized as "however much space is left over" rather than a
  // fixed cap that assumes a wide desktop card.
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const maxAbs = data.reduce((m, d) => Math.max(m, d.value || 0), 0) || 1;
  // Axis bounds, headroom, and ticks all need to land on clean percentages
  // (50%, not 51%) — computing headroom as a raw-count multiplier (maxAbs *
  // 1.2) and only converting to % for display let the domain edge fall on
  // an arbitrary value that happened to round to an odd number. Round the
  // *percentage* up to the next 10 first (with a guaranteed >0 gap even when
  // the real max is already an exact multiple of 10), then convert that
  // clean percentage back to raw-count units for the actual domain.
  const maxPct = total > 0 ? (maxAbs / total) * 100 : 0;
  const axisMaxPct = Math.ceil((maxPct + 1) / 10) * 10;
  const axisMax = (axisMaxPct / 100) * (total || 1);
  const fmtAxisPct = (v) => formatPercent(Math.round((Math.abs(v) / (total || 1)) * 100), lang);
  // Per-bar data label: each row's share of all responses; blank for the empty
  // (zero) side of the row so only the real bar is labelled.
  const fmtLabelPct = (v) => (v ? formatPercent(Math.round((Math.abs(v) / (total || 1)) * 100), lang) : '');

  // Split into two signed series so positives render right of 0 and negatives
  // left of 0 (stackOffset="sign"). Only one is ever non-zero per row.
  // Give labels enough width to avoid wrapping, capped at 340 so bars keep
  // room on a wide card — but never wider than the card actually allows: chart
  // margins (left 4 + right 24) plus a minimum usable bar width (120, enough
  // for a short bar and its % label) are reserved first, and the label column
  // gets whatever's left. Falls back to the label-driven width before the
  // first ResizeObserver measurement lands. Measures the real rendered width
  // of the longest label (measureText.js) instead of estimating from an
  // average char-width constant — a fixed estimate can never be exact for a
  // proportional font (proven repeatedly: 7.0 → 8.0 → +8% safety margin
  // still clipped real labels, e.g. "Saved me time searching and reading").
  const labelDrivenWidth = Math.min(340, Math.max(160, Math.max(...data.map(d => measureTextWidth(d.name || ''))) + 16));
  const MIN_BAR_AREA = 120;
  const CHART_MARGINS = 28;
  const availableWidth = containerWidth
    ? Math.max(100, containerWidth - CHART_MARGINS - MIN_BAR_AREA)
    : labelDrivenWidth;
  const yAxisWidth = Math.min(labelDrivenWidth, availableWidth);
  const lineH = 16;
  const maxTextWidth = Math.max(20, yAxisWidth - 8);

  const wrapLines = (text) => {
    const words = (text || '').split(' ');
    const lines = [];
    let cur = '';
    for (const word of words) {
      const candidate = cur ? `${cur} ${word}` : word;
      if (measureTextWidth(candidate) <= maxTextWidth) { cur = candidate; }
      else { if (cur) lines.push(cur); cur = word; }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const allWrapped = data.map(d => wrapLines(d.name || ''));
  const maxLines = allWrapped.length > 0 ? Math.max(...allWrapped.map(ls => ls.length)) : 1;
  const maxLineWidth = allWrapped.length > 0 ? Math.max(...allWrapped.flatMap(ls => ls.map(l => measureTextWidth(l)))) : 60;
  const barPx = Math.max(36, maxLines * lineH + 8);
  const xOffset = Math.min(maxLineWidth + 8, yAxisWidth - 6);

  const renderYTick = ({ x, y, payload }) => {
    const lines = wrapLines(payload.value || '');
    const yStart = y - ((lines.length - 1) * lineH) / 2;
    return (
      <text className="hbar-ytick-label" fontSize={16} fill="#333" textAnchor="start">
        {lines.map((line, i) => (
          <tspan key={i} x={x - xOffset} y={yStart + i * lineH} dy="0.355em">{line}</tspan>
        ))}
      </text>
    );
  };

  const rows = data.map((d) => ({
    ...d,
    pos: d.positive ? d.value : 0,
    neg: d.positive ? 0 : -d.value,
  }));

  // Tooltip shows the raw count (the percentage is on the bar label).
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip__title">{row.name}</div>
        <div>{formatNumber(row.value, lang)}</div>
      </div>
    );
  };

  const tableRows = a11y
    ? data.map((d) => [d.name, formatNumber(d.value, lang), formatPercent(Math.round((d.value / (total || 1)) * 100), lang)])
    : [];

  return (
    <div className="dashboard-card diverging-bar-card">
      <h3 className={`card-title${subtitle ? ' card-title--has-subtitle' : ''}`}>{title}</h3>
      {subtitle && <p className="card-subtitle font-size-text-xsm-nr">{subtitle}</p>}
      {data.length === 0 ? (
        <div className="diverging-bar-card__no-data font-size-text-xsm-nr" style={{ height: height || 200 }}>
          {noDataLabel}
        </div>
      ) : (
        <>
          <div ref={containerRef}>
            <ResponsiveContainer width="100%" height={height || Math.max(120, data.length * barPx)}>
              <BarChart data={rows} layout="vertical" stackOffset="sign" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[-axisMax, axisMax]} allowDecimals={false} tickFormatter={fmtAxisPct} tick={{ fontSize: 16 }} />
                <YAxis type="category" dataKey="name" width={yAxisWidth} interval={0} tick={renderYTick} />
                {/* #bbb was ~1.9:1 against the card background, below the
                    3:1 minimum for a graphical object (SC 1.4.11).
                    COLOURS.chartStroke is already verified ≥3:1 against
                    white elsewhere in dashboardColours.js — reused here
                    rather than picking a new grey. */}
                <ReferenceLine x={0} stroke={COLOURS.chartStroke} />
                <Tooltip content={<Tip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="neg" stackId="a" fill={COLOURS.feedbackNegative} radius={[0, 0, 0, 0]}>
                  {rows.map((row, i) => <Cell key={i} fill={row.colour || COLOURS.feedbackNegative} stroke={row.stroke || 'none'} strokeWidth={row.strokeWidth || 0} />)}
                  <LabelList dataKey="neg" position="left" formatter={fmtLabelPct} style={{ fontSize: 16, fill: '#333', stroke: 'none' }} />
                </Bar>
                <Bar dataKey="pos" stackId="a" fill={COLOURS.feedbackPositive} radius={[0, 0, 0, 0]}>
                  {rows.map((row, i) => <Cell key={i} fill={row.colour || COLOURS.feedbackPositive} stroke={row.stroke || 'none'} strokeWidth={row.strokeWidth || 0} />)}
                  <LabelList dataKey="pos" position="right" formatter={fmtLabelPct} style={{ fontSize: 16, fill: '#333', stroke: 'none' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {a11y && (
            <ChartDataToggle
              label={a11y.rawDataTableLabel}
              caption={a11y.captionTemplate.replace('{title}', title || subtitle || '')}
              columns={[a11y.categoryLabel, a11y.valueLabel, a11y.percentLabel]}
              rows={tableRows}
            />
          )}
        </>
      )}
    </div>
  );
};

export default DivergingBarCard;
