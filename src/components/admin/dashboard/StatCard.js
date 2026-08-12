import React from 'react';

// `href` (optional) makes the whole card a same-page link — e.g. the Content
// issues/Harmful KPI cards jump to (and auto-expand) their chat-list section
// further down the page. Renders as a real <a> instead of a <div> so the
// entire card is one keyboard-focusable, clickable target, not just a small
// link inside `sub`.
const StatCard = ({ label, value, sub, valueColour, className, href = null }) => {
  const Tag = href ? 'a' : 'div';
  return (
    <Tag
      href={href || undefined}
      className={`dashboard-card stat-card${href ? ' stat-card--link' : ''}${className ? ` ${className}` : ''}`}
    >
      <h3 className="stat-card__label">{label}</h3>
      <p className={`stat-card__value${valueColour ? ` stat-card__value--${valueColour}` : ''}`}>{value}</p>
      {sub && <p className="stat-card__sub font-size-text-xsm-nr">{sub}</p>}
    </Tag>
  );
};

export default StatCard;
