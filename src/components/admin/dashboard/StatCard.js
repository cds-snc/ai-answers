import React from 'react';

const StatCard = ({ label, value, sub, valueColour, className }) => (
  <div className={`dashboard-card stat-card${className ? ` ${className}` : ''}`}>
    <h3 className="stat-card__label">{label}</h3>
    <p className={`stat-card__value${valueColour ? ` stat-card__value--${valueColour}` : ''}`}>{value}</p>
    {sub && <p className="stat-card__sub font-size-text-xsm-nr">{sub}</p>}
  </div>
);

export default StatCard;
