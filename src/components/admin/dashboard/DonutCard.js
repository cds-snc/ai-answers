import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatNumber } from '../../../utils/numberFormat.js';

// Donut (hollow pie) chart in a card, with a big figure floated in the centre.
// `subtitle` and `footer` are optional; omit them for the plain variant.
// `lang` drives locale-aware number formatting in the tooltip.
const DonutCard = ({ title, subtitle, data, colours, centreValue, centreLabel, centreClass, centreMultiLine = false, footer, height = 260, lang = 'en' }) => (
  <div className="dashboard-card donut-card">
    <h3 className={`card-title${subtitle ? ' card-title--has-subtitle' : ''}`}>{title}</h3>
    {subtitle && <p className="card-subtitle font-size-text-xsm-nr">{subtitle}</p>}
    <div className="donut-card__chart-wrap">
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
            {data.map((entry, i) => {
              const c = colours[i % colours.length];
              const fill = typeof c === 'string' ? c : c.fill;
              const stroke = typeof c === 'string' ? 'none' : (c.stroke || 'none');
              return <Cell key={entry.name} fill={fill} stroke={stroke} strokeWidth={stroke === 'none' ? 0 : 2} />;
            })}
          </Pie>
          <Tooltip formatter={(value, name) => [formatNumber(value, lang), name]} />
          <Legend iconType="circle" iconSize={10} />
        </PieChart>
      </ResponsiveContainer>
      <div className={`donut-card__centre${centreMultiLine ? ' donut-card__centre--multi-line' : ''}`}>
        <span className={`donut-card__centre-value${centreClass ? ` donut-card__centre-value--${centreClass}` : ''}`}>{centreValue}</span>
        <span className="donut-card__centre-label">{centreLabel}</span>
      </div>
    </div>
    {footer && (
      <p className="donut-card__footer font-size-text-xsm-nr">{footer}</p>
    )}
  </div>
);

export default DonutCard;
