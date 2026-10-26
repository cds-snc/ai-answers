import React from 'react';

// Stand-in for a chart or donut that is below its minimum-sample threshold.
// The card keeps the section's title on the page with a short explanation, so a
// narrow filter selection visibly reduces the data instead of silently making
// whole cards disappear. Not announced — like the charts it stands in for, it's
// data a screen-reader user reads by navigating the cards, not an outcome to
// call out (the dashboard-level "no data" StatusMessage covers that).
const NoDataCard = ({ title, message }) => (
  <div className="dashboard-card no-data-card">
    <h3 className="card-title">{title}</h3>
    <p className="no-data-card__message font-size-text-xsm-nr">{message}</p>
  </div>
);

export default NoDataCard;
