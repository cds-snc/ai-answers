import { BLOCK_QUERY_GROUPS } from '../../constants/blockedQueryTypes.js';

// Ranked bar rows for the blocked-query chart shared by the exec and partner
// dashboards. Sums each display group across its member types (the two privacy
// stages collapse into one row), keeps the fixed pipeline order, drops zero rows.
// `blockedQueries` is the metric bundle's blockedQueries object
// ({ [type]: { total, en, fr }, total: {...} }).
export const buildBlockedBarData = (blockedQueries, t) =>
  BLOCK_QUERY_GROUPS
    .map(({ key, types }) => {
      const rows = types.map((type) => (blockedQueries || {})[type] || {});
      const sum = (field) => rows.reduce((acc, row) => acc + (row[field] || 0), 0);
      return {
        name: t(`blockedQueries.types.${key}`),
        value: sum('total'),
        en: sum('en'),
        fr: sum('fr'),
      };
    })
    .filter((d) => d.value > 0);

export default buildBlockedBarData;
