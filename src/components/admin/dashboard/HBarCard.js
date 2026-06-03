import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { COLOURS } from '../../../constants/dashboardColours.js';
import { formatNumber } from '../../../utils/numberFormat.js';

// Horizontal bar chart in a card, for ranked lists. `height` is optional and
// defaults to a height that grows with the number of rows. `lang` drives
// locale-aware number formatting in the tooltip.
const HBarCard = ({ title, data, height, colour = COLOURS.brand, lang = 'en' }) => (
  <div style={{
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '24px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }}>
    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#333' }}>{title}</div>
    <ResponsiveContainer width="100%" height={height || Math.max(200, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value) => formatNumber(value, lang)} />
        <Bar dataKey="value" fill={colour} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export default HBarCard;
