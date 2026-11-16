import { User } from '../../models/user.js';
import { Batch } from '../../models/batch.js';
import { normalizeInstitution, normalizeGroup } from '../../services/UserService.js';
import { normalizeObjectIdString } from './db-query.js';

// Who may see / change / run a batch (security finding AIA-001): admins and
// the batch's creator only. Every batch endpoint, the batch filter on the
// chat-log exports, and chat-graph-run.js's findRunnableBatch go through
// batchAccessFilter (mostly via findAccessibleBatch), so the rule lives in
// one place and a new endpoint can't look a batch up without it.
//
// Legacy batches with no createdBy belong to no one: admins only.
//
// Callers answer 404 (not 403) when access is denied, so a partner can't use
// the batch endpoints to learn which batch ids exist.

const MATCH_NOTHING = { _id: { $in: [] } };

export const isAdmin = (user) => user?.role === 'admin';

/**
 * Mongo conditions limiting batches to the ones `user` may access: none
 * extra for an admin, `createdBy` for anyone else. null when `user` can
 * access no batch at all (signed out, no userId).
 */
export function batchAccessFilter(user) {
  if (isAdmin(user)) return {};
  const userId = user?.userId ? String(user.userId) : '';
  return userId ? { createdBy: userId } : null;
}

/**
 * The batch with this id if `user` may access it, else null (also for an
 * invalid id). One query, lean. Callers answer 404 on null.
 */
export async function findAccessibleBatch(user, batchId, projection) {
  const id = normalizeObjectIdString(batchId);
  const access = batchAccessFilter(user);
  if (!id || !access) return null;
  return Batch.findOne({ _id: id, ...access }, projection).lean();
}

async function creatorFilter(userQuery) {
  const users = await User.find(userQuery, { _id: 1 }).lean();
  const ids = users.map((u) => String(u._id));
  return ids.length ? { createdBy: { $in: ids } } : MATCH_NOTHING;
}

/**
 * Parses the batch list's `scope` query param (admins only; see
 * batchListFilter). Anything unrecognised falls back to "mine", never to
 * "all", so a typo can't widen what's shown.
 *   mine | all | institution:<abbrKey> | group:<name> | user:<userId>
 */
export function parseBatchScope(scope) {
  if (typeof scope !== 'string' || scope === '' || scope === 'mine') return { kind: 'mine' };
  if (scope === 'all') return { kind: 'all' };
  const sep = scope.indexOf(':');
  if (sep === -1) return { kind: 'mine' };
  const kind = scope.slice(0, sep);
  const value = scope.slice(sep + 1);
  if (kind === 'institution') {
    const institution = normalizeInstitution(value);
    return institution ? { kind, value: institution } : { kind: 'invalid' };
  }
  if (kind === 'group') {
    const group = normalizeGroup(value);
    return group ? { kind, value: group } : { kind: 'invalid' };
  }
  if (kind === 'user') {
    const userId = normalizeObjectIdString(value);
    return userId ? { kind, value: userId } : { kind: 'invalid' };
  }
  return { kind: 'mine' };
}

/**
 * Mongo filter for the batches `user` may list.
 *   Partners: their own only (scope ignored).
 *   Admins:   whatever `scope` picks; defaults to their own.
 */
export async function batchListFilter(user, scope) {
  const userId = user?.userId ? String(user.userId) : '';
  if (!userId) return MATCH_NOTHING;

  if (!isAdmin(user)) return { createdBy: userId };

  const parsed = parseBatchScope(scope);
  switch (parsed.kind) {
    case 'all':
      return {};
    case 'institution':
      return creatorFilter({ institution: parsed.value });
    case 'group':
      return creatorFilter({ group: parsed.value });
    case 'user':
      return { createdBy: parsed.value };
    case 'invalid':
      return MATCH_NOTHING;
    default:
      return { createdBy: userId };
  }
}
