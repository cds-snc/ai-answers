import moment from 'moment';

if (typeof window !== 'undefined') {
  window.moment = moment;
}

if (typeof globalThis !== 'undefined') {
  globalThis.moment = moment;
}

export default moment;
