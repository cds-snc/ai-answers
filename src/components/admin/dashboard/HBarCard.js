import React from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
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
const HBarCard = ({ title, subtitle, data, height, colour = COLOURS.brand, percent = false, noDataLabel = '', lang = 'en', tooltipContent = null, yAxisWidth = 160, yAxisTextAlign = 'left', marginLeft = 8 }) => {
  const fmtVal = (v) => (percent ? formatPercent(v, lang) : formatNumber(v, lang));
  const lineH = 18;
  const CHAR_PX = 8.0;
  const YAXIS_W = yAxisWidth;
  const charsPerLine = Math.floor((YAXIS_W - 8) / CHAR_PX);
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
  return (
    <div className="dashboard-card hbar-card">
      <h3 className={`card-title${subtitle ? ' card-title--has-subtitle' : ''}`}>{title}</h3>
      {subtitle && <p className="card-subtitle font-size-text-xsm-nr">{subtitle}</p>}
      {data.length === 0 ? (
        <div className="hbar-card__no-data font-size-text-xsm-nr" style={{ height: height || 200 }}>
          {noDataLabel}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height || Math.max(200, data.length * barPx)}>
          <BarChart data={data} layout="vertical" margin={{ left: marginLeft, right: 44, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={percent ? [0, 100] : undefined} tickFormatter={percent ? fmtVal : undefined} tick={{ fontSize: 16 }} />
            <YAxis type="category" dataKey="name" width={effectiveYAxisWidth} interval={0} tick={renderYTick} />
            {tooltipContent
              ? <Tooltip content={tooltipContent} />
              : <Tooltip formatter={(value) => fmtVal(value)} />}
            <Bar dataKey="value" fill={colour} radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.colour || colour} stroke={entry.stroke || 'none'} strokeWidth={entry.strokeWidth || 0} />
              ))}
              <LabelList dataKey="value" position="right" formatter={fmtVal} style={{ fontSize: 16, fill: '#333', stroke: 'none' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default HBarCard;
