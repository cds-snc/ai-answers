import React, { useEffect, useRef, useState } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import ChartDataToggle from './ChartDataToggle.js';
import { COLOURS } from '../../../constants/dashboardColours.js';
import { formatNumber, formatPercent } from '../../../utils/numberFormat.js';

// Horizontal bar chart in a card, for ranked lists. `height` is optional and
// defaults to a height that grows with the number of rows. `lang` drives
// locale-aware number formatting. Pass `percent` to render values as
// percentages (0–100) on a fixed 0–100 axis. Bars use the single `colour`
// unless a data row carries its own `colour`, in which case the per-row colour
// wins. `subtitle` and `noDataLabel` are optional. Pass `tooltipContent` (a
// recharts custom-content render fn/component) to replace the default
// value-only tooltip — e.g. to surface extra per-row fields like an EN/FR split.
// `a11y` (see ChartDataToggle.js) adds a slim "As raw data table" expand/
// collapse below the chart — the SVG's Tooltip (default or custom) only fires
// on mouse hover; the chart itself always stays visible either way.
const HBarCard = ({ title, subtitle, data, height, colour = COLOURS.brand, percent = false, noDataLabel = '', lang = 'en', tooltipContent = null, yAxisWidth = 160, yAxisTextAlign = 'left', marginLeft = 8, a11y = null }) => {
  // `yAxisWidth` is a caller-chosen desired width (up to 240 for Departments/
  // Top programs) with no idea how much space the card actually has, so on a
  // narrow card the label column can claim more room than exists and the
  // manually-positioned tick text (renderYTick below) gets clipped past the
  // chart's real edge. Measure the rendered width and never let the label
  // column exceed what's left after margins and a minimum usable bar width.
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

  const fmtVal = (v) => (percent ? formatPercent(v, lang) : formatNumber(v, lang));
  const lineH = 18;
  // 8.0 (was 7.0) — a closer estimate of actual rendered character width at
  // this font size; the old, too-narrow estimate let wrapLines pack more
  // characters onto a line than actually fit, clipping the tail of the line.
  const CHAR_PX = 8.0;
  const MIN_BAR_AREA = 100;
  const RIGHT_MARGIN = 44;
  const availableWidth = containerWidth
    ? Math.max(80, containerWidth - marginLeft - RIGHT_MARGIN - MIN_BAR_AREA)
    : yAxisWidth;
  const YAXIS_W = Math.min(yAxisWidth, availableWidth);
  const charsPerLine = Math.floor((YAXIS_W - 8) / CHAR_PX); // ~20 chars
  const wrapLines = (text) => {
    const words = (text || '').split(' ');
    const lines = [];
    let cur = '';
    for (const word of words) {
      const candidate = cur ? `${cur} ${word}` : word;
      if (candidate.length <= charsPerLine) { cur = candidate; }
      else { if (cur) lines.push(cur); cur = word; }
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const allWrapped = (data || []).map(d => wrapLines(d.name || ''));
  const maxLines = allWrapped.length > 0 ? Math.max(...allWrapped.map(ls => ls.length)) : 1;
  const maxLineLen = allWrapped.length > 0 ? Math.max(...allWrapped.flatMap(ls => ls.map(l => l.length))) : 10;
  const barPx = Math.max(40, maxLines * lineH + 16);
  const xOffset = Math.min(maxLineLen * CHAR_PX + 8, YAXIS_W - 6);
  // When right-aligned, only allocate as much axis space as the text needs.
  const effectiveYAxisWidth = yAxisTextAlign === 'right'
    ? Math.min(YAXIS_W, maxLineLen * CHAR_PX + 16)
    : YAXIS_W;
  const renderYTick = ({ x, y, payload }) => {
    const lines = wrapLines(payload.value || '');
    const yStart = y - ((lines.length - 1) * lineH) / 2;
    const isRight = yAxisTextAlign === 'right';
    return (
      <text className="hbar-ytick-label" fontSize={16} fill="#333" textAnchor={isRight ? 'end' : 'start'}>
        {lines.map((line, i) => (
          <tspan key={i} x={isRight ? x : x - xOffset} y={yStart + i * lineH} dy="0.355em">{line}</tspan>
        ))}
      </text>
    );
  };
  const tableRows = a11y ? (data || []).map((d) => [d.name, fmtVal(d.value)]) : [];

  return (
    <div className="dashboard-card hbar-card">
      <h3 className={`card-title${subtitle ? ' card-title--has-subtitle' : ''}`}>{title}</h3>
      {subtitle && <p className="card-subtitle font-size-text-xsm-nr">{subtitle}</p>}
      {data.length === 0 ? (
        <div className="hbar-card__no-data font-size-text-xsm-nr" style={{ height: height || 200 }}>
          {noDataLabel}
        </div>
      ) : (
        <>
          <div ref={containerRef}>
            <ResponsiveContainer width="100%" height={height || Math.max(200, data.length * barPx)}>
              <BarChart data={data} layout="vertical" margin={{ left: marginLeft, right: 44, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={percent ? [0, 100] : undefined} tickFormatter={percent ? fmtVal : undefined} tick={{ fontSize: 16 }} />
                <YAxis type="category" dataKey="name" width={effectiveYAxisWidth} interval={0} tick={renderYTick} />
                {tooltipContent
                  ? <Tooltip content={tooltipContent} />
                  : <Tooltip formatter={(value) => fmtVal(value)} />}
                <Bar dataKey="value" fill={colour} radius={[0, 0, 0, 0]}>
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.colour || colour} stroke={entry.stroke || 'none'} strokeWidth={entry.strokeWidth || 0} />
                  ))}
                  <LabelList dataKey="value" position="right" formatter={fmtVal} style={{ fontSize: 16, fill: '#333', stroke: 'none' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {a11y && (
            <ChartDataToggle
              label={a11y.rawDataTableLabel}
              caption={a11y.captionTemplate.replace('{title}', title || subtitle || '')}
              columns={[a11y.categoryLabel, a11y.valueLabel]}
              rows={tableRows}
            />
          )}
        </>
      )}
    </div>
  );
};

export default HBarCard;
