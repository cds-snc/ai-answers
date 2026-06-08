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
const HBarCard = ({ title, subtitle, data, height, colour = COLOURS.brand, percent = false, noDataLabel = '', lang = 'en', tooltipContent = null }) => {
  const fmtVal = (v) => (percent ? formatPercent(v, lang) : formatNumber(v, lang));
  return (
    <div className="dashboard-card hbar-card">
      <h3 className={`card-title${subtitle ? ' card-title--has-subtitle' : ''}`}>{title}</h3>
      {subtitle && <p className="card-subtitle font-size-text-xsm-nr">{subtitle}</p>}
      {data.length === 0 ? (
        <div className="hbar-card__no-data font-size-text-xsm-nr" style={{ height: height || 200 }}>
          {noDataLabel}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height || Math.max(200, data.length * 40)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 44, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={percent ? [0, 100] : undefined} tickFormatter={percent ? fmtVal : undefined} tick={{ fontSize: 16 }} />
            <YAxis type="category" dataKey="name" width={160} interval={0} tick={{ fontSize: 16 }} />
            {tooltipContent
              ? <Tooltip content={tooltipContent} />
              : <Tooltip formatter={(value) => fmtVal(value)} />}
            <Bar dataKey="value" fill={colour} radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.colour || colour} />
              ))}
              <LabelList dataKey="value" position="right" formatter={fmtVal} style={{ fontSize: 16, fill: '#333' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default HBarCard;
