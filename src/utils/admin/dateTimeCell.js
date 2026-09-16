import { formatLocaleDate } from '../formatLocaleDate.js';
import { escapeHtml } from '../htmlEscape.js';

const DATE_OPTIONS = { year: 'numeric', month: 'short', day: 'numeric' };
const TIME_OPTIONS = { hour: '2-digit', minute: '2-digit' };

/**
 * Date-column cell markup for the dashboard DataTables: the date on one
 * line, the time on the next. Always two lines rather than one wrapping
 * string, so the column stays as narrow as the date alone and leaves the
 * width for columns that carry real content.
 *
 * @param {string|Date|null|undefined} value
 * @param {string} lang - 'en' | 'fr'
 * @returns {string} HTML, or '' for an empty/invalid value
 */
export function renderDateTimeCell(value, lang) {
  const date = formatLocaleDate(value, lang, '', DATE_OPTIONS);
  if (!date) return '';
  const time = formatLocaleDate(value, lang, '', TIME_OPTIONS);
  return `${escapeHtml(date)}<br>${escapeHtml(time)}`;
}
