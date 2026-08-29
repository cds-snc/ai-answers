import dbConnect from '../api/db/db-connect.js';
import { ServiceCallErrorCounter } from '../models/serviceCallErrorCounter.js';
import ServerLoggingService from './ServerLoggingService.js';

function startOfUtcDay(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

class ServiceCallMetricsService {
  // Fire-and-forget, same contract as BlockedQueryService.record(): never
  // throws, must never delay or break the answer pipeline. Call sites invoke
  // this without awaiting it.
  static async _record({ service, type, event }) {
    try {
      if (!service || !type || !event) return;
      await dbConnect();
      await ServiceCallErrorCounter.updateOne(
        { date: startOfUtcDay(new Date()), service, type, event },
        { $inc: { count: 1 } },
        { upsert: true }
      );
    } catch (error) {
      // Swallow — counters are best-effort and must never break the pipeline.
      try {
        await ServerLoggingService.warn('ServiceCallMetricsService.record failed', 'system', {
          error: error?.message || String(error),
          service,
          type,
          event,
        });
      } catch (_e) {
        // ignore — logging must not throw either
      }
    }
  }

  // A call ultimately failed after exhausting its retries.
  static async recordError({ service, type }) {
    return this._record({ service, type, event: 'error' });
  }

  // One retry attempt happened (the call failed once but is being retried).
  static async recordRetry({ service, type }) {
    return this._record({ service, type, event: 'retry' });
  }

  // Aggregates error/retry counts within [start, end] (Date objects), grouped
  // by service and type. Returns e.g.:
  //   { search: { google: { errors, retries }, canadaca: { errors, retries } },
  //     ai: { context: { errors, retries }, answer: { errors, retries } } }
  static async getMetrics({ start, end } = {}) {
    const empty = { search: {}, ai: {} };
    try {
      await dbConnect();

      // Counter docs are bucketed at UTC midnight, but `start` is an exact
      // instant (e.g. "now minus 7 days") that's almost never day-aligned —
      // matching date >= start as-is would silently drop the oldest day's
      // whole bucket. Floor `start` to UTC midnight; `end` needs no such fix
      // since a day bucket is always <= any later instant that same day.
      const rows = await ServiceCallErrorCounter.aggregate([
        { $match: { date: { $gte: startOfUtcDay(new Date(start)), $lte: new Date(end) } } },
        { $group: { _id: { service: '$service', type: '$type', event: '$event' }, count: { $sum: '$count' } } },
      ]);

      const result = { search: {}, ai: {} };
      for (const row of rows) {
        const { service, type, event } = row?._id || {};
        if (!result[service]) continue;
        if (!result[service][type]) result[service][type] = { errors: 0, retries: 0 };
        const count = row?.count || 0;
        if (event === 'error') result[service][type].errors += count;
        else if (event === 'retry') result[service][type].retries += count;
      }

      return result;
    } catch (error) {
      // These counters are best-effort (see _record's own contract above) —
      // a transient failure here must degrade to empty, not fail the whole
      // technical-metrics response that MetricsService.getTechnicalMetrics
      // otherwise builds alongside an unrelated, healthy Chat.aggregate.
      try {
        await ServerLoggingService.warn('ServiceCallMetricsService.getMetrics failed', 'system', {
          error: error?.message || String(error),
        });
      } catch (_e) {
        // ignore — logging must not throw either
      }
      return empty;
    }
  }
}

export default ServiceCallMetricsService;
