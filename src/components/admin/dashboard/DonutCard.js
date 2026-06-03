import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { COLOURS } from '../../../constants/dashboardColours.js';

// Donut (hollow pie) chart in a card, with a big figure floated in the centre.
// `subtitle` and `footer` are optional; omit them for the plain variant.
const DonutCard = ({ title, subtitle, data, colours, centreValue, centreLabel, footer, height = 260 }) => (
  <div style={{
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '24px 16px',
    flex: 1,
    minWidth: 280,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }}>
    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: subtitle ? 4 : 12, color: '#333' }}>{title}</div>
    {subtitle && <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>{subtitle}</div>}
    <div style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={100}
            dataKey="value"
            paddingAngle={2}
          >
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={colours[i % colours.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value, name) => [value.toLocaleString(), name]} />
          <Legend iconType="circle" iconSize={10} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -68%)',
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: COLOURS.brand, lineHeight: 1 }}>{centreValue}</div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{centreLabel}</div>
      </div>
    </div>
    {footer && (
      <div style={{ textAlign: 'center', fontSize: 13, color: '#666', marginTop: 4, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
        {footer}
      </div>
    )}
  </div>
);

export default DonutCard;
