import React from 'react';
import { COLOURS } from '../../../constants/dashboardColours.js';

// KPI stat card: a label, one big number, and an optional sub-line.
// `uppercase` renders the label in caps with wider tracking (partner dashboard
// style); the default is the plainer exec dashboard style.
const StatCard = ({ label, value, sub, uppercase = false }) => (
  <div style={{
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '24px 28px',
    flex: 1,
    minWidth: 160,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }}>
    <div style={{
      fontSize: 13,
      color: '#666',
      marginBottom: 6,
      textTransform: uppercase ? 'uppercase' : 'none',
      letterSpacing: uppercase ? '0.05em' : '0.02em',
    }}>{label}</div>
    <div style={{ fontSize: 42, fontWeight: 700, color: COLOURS.brand, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 13, color: '#888', marginTop: 6 }}>{sub}</div>}
  </div>
);

export default StatCard;
