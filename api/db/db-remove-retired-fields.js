import dbConnect from './db-connect.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import SettingsAuditService from '../../services/SettingsAuditService.js';
import { User } from '../../models/user.js';

// Fields that are no longer in a schema but may still be stored on old
// documents. A `.lean()` export returns every stored field, so they stay
// visible until removed. Adding an entry takes a PR, and the review is the
// approval: never take a model or field name from the request.
// The test fails if a listed field is still in its model's schema.
export const RETIRED_FIELDS = [
  { model: User, field: 'resetPasswordSecret' }, // #1980
  { model: User, field: 'resetPasswordAttempts' }, // #1980
  { model: User, field: 'resetPasswordLockedUntil' }, // #1980
  { model: User, field: 'twoFASecret' }, // legacy TOTP secret, unused since b3a8e6fe
];

const keyOf = ({ model, field }) => `${model.collection.collectionName}.${field}`;

// Model.collection, not the Mongoose model: strict mode drops a $unset on a
// path the schema doesn't have, so Model.updateMany would report success and
// change nothing.
const countField = ({ model, field }) => model.collection.countDocuments({ [field]: { $exists: true } });

async function countRetiredFields() {
  return Promise.all(RETIRED_FIELDS.map(async (entry) => ({
    collection: entry.model.collection.collectionName,
    field: entry.field,
    count: await countField(entry),
  })));
}

// The page sends back the list it showed the admin. Refuse if it isn't
// exactly this server's list, so a deploy that changed the list between the
// counts and the confirm can't remove a field the admin never saw.
function matchesConfirmedList(confirmed) {
  if (!Array.isArray(confirmed) || !confirmed.every((key) => typeof key === 'string')) return false;
  const expected = RETIRED_FIELDS.map(keyOf);
  const given = new Set(confirmed);
  return given.size === expected.length && confirmed.length === expected.length && expected.every((key) => given.has(key));
}

// One updateMany per collection, unsetting all of its fields in one pass.
// Each field's count is taken just before, and that is what gets reported:
// nothing writes these fields any more, so the count can't change meanwhile.
// Results are pushed as each collection finishes, so a failure partway still
// leaves a record of what was removed.
async function removeRetiredFields(results) {
  const byModel = new Map();
  for (const entry of RETIRED_FIELDS) {
    if (!byModel.has(entry.model)) byModel.set(entry.model, []);
    byModel.get(entry.model).push(entry);
  }
  for (const [model, entries] of byModel) {
    const counts = await Promise.all(entries.map(countField));
    await model.collection.updateMany(
      { $or: entries.map(({ field }) => ({ [field]: { $exists: true } })) },
      { $unset: Object.fromEntries(entries.map(({ field }) => [field, ''])) }
    );
    entries.forEach((entry, i) => results.push({ collection: model.collection.collectionName, field: entry.field, removed: counts[i] }));
  }
}

async function removeRetiredFieldsHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    await dbConnect();
    if (req.method === 'GET') {
      return res.status(200).json({ fields: await countRetiredFields() });
    }
  } catch (error) {
    console.error('Count retired fields error:', error);
    return res.status(500).json({ message: 'Count retired fields failed' });
  }

  if (!matchesConfirmedList(req.body?.fields)) {
    return res.status(409).json({ message: 'The list of retired fields has changed. Check the counts again.' });
  }

  const fields = [];
  let failed = false;
  try {
    await removeRetiredFields(fields);
    return res.status(200).json({ fields });
  } catch (error) {
    failed = true;
    console.error('Remove retired fields error:', error);
    return res.status(500).json({ message: 'Remove retired fields failed' });
  } finally {
    // Field names go in the value, not as metadata keys: the audit service
    // redacts any metadata key that looks like "secret" or "password".
    await SettingsAuditService.recordAuditSafely(
      () => SettingsAuditService.recordAction({
        actorUserId: req.user?.userId,
        actorEmail: req.user?.email || 'Unknown admin',
        source: 'admin',
        action: failed ? 'database.retired_fields_removal_failed' : 'database.retired_fields_removed',
        metadata: {
          removed: fields.map(({ collection, field, removed }) => `${collection}.${field}: ${removed}`).join(', ') || 'none',
        },
      }),
      'Failed to record retired field removal audit entry'
    );
  }
}

export default function handler(req, res) {
  return withProtection(removeRetiredFieldsHandler, authMiddleware, adminMiddleware)(req, res);
}
