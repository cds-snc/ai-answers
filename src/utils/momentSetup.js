import moment from 'moment';
// Registers French locale data on the shared moment singleton (passive side
// effect — does not change the global default locale). Needed anywhere we
// format a date for French UI, e.g. FilterPanel's calendar cell labels.
import 'moment/locale/fr';

if (typeof window !== 'undefined') {
  window.moment = moment;
}

if (typeof globalThis !== 'undefined') {
  globalThis.moment = moment;
}

export default moment;
