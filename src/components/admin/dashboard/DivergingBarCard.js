import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, LabelList } from 'recharts';
import { COLOURS } from '../../../constants/dashboardColours.js';
import { formatNumber, formatPercent } from '../../../utils/numberFormat.js';

// Diverging horizontal bar chart in a card: positive rows extend right (green),
// negative rows extend left (red), from a shared zero baseline. The axis is
// labelled as a percentage of all responses, and each bar carries its share as
// a percentage data label; the tooltip shows the raw count. Rows are plotted
// top→bottom in the order given, so the
// caller controls grouping (e.g. positives first, negatives last → negatives at
// the bottom). Each row needs { name, value, positive } where `value` is the
// non-negative count and `positive` decides the side/colour.
const DivergingBarCard = ({ title, subtitle, data = [], height, lang = 'en', noDataLabel = '' }) => {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const maxAbs = data.reduce((m, d) => Math.max(m, d.value || 0), 0) || 1;
  // Leave headroom past the longest bar so its end-of-bar % label isn't clipped.
  const axisMax = maxAbs * 1.2;
  const fmtAxisPct = (v) => formatPercent(Math.round((Math.abs(v) / (total || 1)) * 100), lang);
  // Per-bar data label: each row's share of all responses; blank for the empty
  // (zero) side of the row so only the real bar is labelled.
  const fmtLabelPct = (v) => (v ? formatPercent(Math.round((Math.abs(v) / (total || 1)) * 100), lang) : '');

  // Split into two signed series so positives render right of 0 and negatives
  // left of 0 (stackOffset="sign"). Only one is ever non-zero per row.
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

  return (
    <div className="dashboard-card diverging-bar-card">
      <h3 className={`card-title${subtitle ? ' card-title--has-subtitle' : ''}`}>{title}</h3>
      {subtitle && <p className="card-subtitle font-size-text-xsm-nr">{subtitle}</p>}
      {data.length === 0 ? (
        <div className="diverging-bar-card__no-data font-size-text-xsm-nr" style={{ height: height || 200 }}>
          {noDataLabel}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height || Math.max(240, data.length * 56)}>
          <BarChart data={rows} layout="vertical" stackOffset="sign" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[-axisMax, axisMax]} allowDecimals={false} tickFormatter={fmtAxisPct} tick={{ fontSize: 16 }} />
            <YAxis type="category" dataKey="name" width={190} interval={0} tick={{ fontSize: 16 }} />
            <ReferenceLine x={0} stroke="#bbb" />
            <Tooltip content={<Tip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Bar dataKey="neg" stackId="a" fill={COLOURS.feedbackNegative} radius={[3, 0, 0, 3]}>
              <LabelList dataKey="neg" position="left" formatter={fmtLabelPct} style={{ fontSize: 16, fill: '#333' }} />
            </Bar>
            <Bar dataKey="pos" stackId="a" fill={COLOURS.feedbackPositive} radius={[0, 3, 3, 0]}>
              <LabelList dataKey="pos" position="right" formatter={fmtLabelPct} style={{ fontSize: 16, fill: '#333' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default DivergingBarCard;
