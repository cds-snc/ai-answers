import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import ChartDataToggle from './ChartDataToggle.js';
import { formatNumber, formatPercent } from '../../../utils/numberFormat.js';

// Single 100%-stacked horizontal bar in a card: one thin bar split into
// segments, each segment's share of the total shown as a % label when there's
// room, raw count + % in the tooltip. Good for a small fixed set of
// mutually-exclusive categories that sum to one whole (e.g. conversation
// length: single/two/three+ questions) — same part-to-whole read as a donut,
// but bar length is easier to compare precisely than arc angle.
// `data` = [{ name, value, colour, stroke? }], `value` = raw count. `stroke`
// is optional per-item — set it when that segment's fill doesn't clear 3:1
// against whatever it's touching (the white card edge, or a neighbour of
// similar luminance despite a different hue — WCAG contrast is luminance-only,
// so e.g. green vs red can still fail). Omit it and the segment gets a
// self-coloured (invisible) stroke instead — every segment still gets
// stroke width 1 either way, since SVG strokes are centred on the path (not
// inset), so an unstroked segment would render geometrically smaller than a
// stroked one and look like it "sticks out".
// `leftContent` (optional) renders arbitrary content — e.g. a title/subtitle/
// stat block — to the left of the bar, inside the same card
// (stacked-bar-card--side-by-side). Replaces title/subtitle (ignored when
// leftContent is passed) — pass `a11yTitle` alongside it so the data-table
// caption below still has a heading to reference. `a11y` (see
// ChartDataToggle.js) adds a slim "As raw data table" expand/collapse below
// the bar: the legend already shows name+% as static text, but the raw count
// is otherwise hover-only.
const StackedBarCard = ({ title, subtitle, data = [], height = 56, lang = 'en', noDataLabel = '', leftContent = null, a11y = null, a11yTitle = null }) => {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const fmtPct = (v) => formatPercent(total > 0 ? Math.round((v / total) * 100) : 0, lang);
  const tableRows = a11y ? data.map((d) => [d.name, formatNumber(d.value, lang), fmtPct(d.value)]) : [];
  const dataToggle = a11y && total > 0 ? (
    <ChartDataToggle
      label={a11y.rawDataTableLabel}
      caption={a11y.captionTemplate.replace('{title}', title || subtitle || a11yTitle || '')}
      columns={[a11y.categoryLabel, a11y.valueLabel, a11y.percentLabel]}
      rows={tableRows}
    />
  ) : null;

  // One synthetic row so every segment stacks into a single bar.
  const row = { name: 'total' };
  data.forEach((d, i) => { row[`v${i}`] = d.value; });

  const Tip = ({ active }) => {
    if (!active) return null;
    return (
      <div className="chart-tooltip">
        {data.map((d, i) => (
          <div key={i}>
            <span
              className="stacked-bar-card__tooltip-swatch"
              style={{ background: d.colour, borderColor: d.stroke || d.colour }}
            />
            {d.name}: {formatNumber(d.value, lang)} ({fmtPct(d.value)})
          </div>
        ))}
      </div>
    );
  };

  const bar = total === 0 ? (
    <div className="stacked-bar-card__no-data font-size-text-xsm-nr" style={{ height }}>{noDataLabel}</div>
  ) : (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={[row]} layout="vertical" margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
          <XAxis type="number" domain={[0, total]} hide />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip content={<Tip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          {data.map((d, i) => {
            return (
              <Bar
                key={d.name}
                dataKey={`v${i}`}
                stackId="a"
                fill={d.colour}
                stroke={d.stroke || d.colour}
                strokeWidth={1}
                radius={[0, 0, 0, 0]}
              />
            );
          })}
        </BarChart>
      </ResponsiveContainer>
      <ul className="stacked-bar-card__legend">
        {data.map((d) => (
          <li key={d.name}>
            {/* Same stroke as the bar segment, so the legend dot matches
                what's actually drawn in the bar. */}
            <span
              className="stacked-bar-card__swatch"
              style={{ background: d.colour, borderColor: d.stroke || d.colour }}
              aria-hidden="true"
            />
            {d.name} ({fmtPct(d.value)})
          </li>
        ))}
      </ul>
    </>
  );

  if (leftContent) {
    return (
      <div className="dashboard-card stacked-bar-card stacked-bar-card--side-by-side">
        <div className="stacked-bar-card__side">{leftContent}</div>
        <div className="stacked-bar-card__bar">
          <div className="stacked-bar-card__inset">{bar}</div>
          {dataToggle}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-200 dashboard-card stacked-bar-card">
      {title && <h3 className={`card-title${subtitle ? ' card-title--has-subtitle' : ''}`}>{title}</h3>}
      {subtitle && <p className="card-subtitle font-size-text-xsm-nr">{subtitle}</p>}
      {bar}
      {dataToggle}
    </div>
  );
};

export default StackedBarCard;
