import dbConnect from '../api/db/db-connect.js';
import { User } from '../models/user.js';
import { requireObjectIdString } from '../api/util/db-query.js';
import { PARTNER_DEPARTMENTS } from '../src/constants/partnerDepartments.js';
import { PARTNER_GROUPS, QA_GROUP, groupFitsInstitution } from '../src/constants/partnerGroups.js';

// User profile and membership: the DB side of the user-me / user-users /
// user-assignable / auth-me handlers, which keep only method, status and
// error-body handling. Auth flows (login, 2FA, reset, signup) are not here.

/**
 * Validates a User.institution value: '' (unassigned) or one of the partner
 * department abbrKeys. Returns the normalized string, or null when invalid.
 */
export function normalizeInstitution(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return '';
  return PARTNER_DEPARTMENTS.includes(trimmed) ? trimmed : null;
}

/**
 * Validates a User.group value: '' (none) or one of the curated partner
 * groups. Returns the normalized string, or null when invalid.
 */
export function normalizeGroup(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return '';
  return PARTNER_GROUPS.includes(trimmed) ? trimmed : null;
}

/**
 * Shared institution/group/preferences shape for a profile response -
 * defaults each field the same way whether the caller is auth-me.js (only
 * institution/group/preferences) or user-me.js (that plus email/role/active).
 */
export function normalizeMembershipProfile(user) {
  return {
    institution: user?.institution || '',
    group: user?.group || '',
    preferences: {
      prefilterDepartment: Boolean(user?.preferences?.prefilterDepartment),
      prefilterGroup: Boolean(user?.preferences?.prefilterGroup)
    }
  };
}

/**
 * The chat-assignment membership rule, shared by chat-assign-interaction.js's
 * assign and unassign handlers and listAssignable below: two users are
 * "membership-linked" when they share a non-empty institution or a
 * non-empty group. An unset field never counts as matching another unset
 * field - two users with no institution are not "sharing" one.
 */
export function sharesMembership(a, b) {
  const sharesInstitution = Boolean(a?.institution) && a.institution === b?.institution;
  const sharesGroup = Boolean(a?.group) && a.group === b?.group;
  return sharesInstitution || sharesGroup;
}

/**
 * Who a partner may assign a question to: anyone membership-linked, plus
 * anyone in the QA group, which is open to every partner. Unassigning stays
 * on sharesMembership alone.
 */
export function canAssignTo(requester, assignee) {
  return sharesMembership(requester, assignee) || assignee?.group === QA_GROUP;
}

/**
 * Mongo $or conditions matching anyone membership-linked to `user` (see
 * sharesMembership) - the query-side version of the same rule. Empty array
 * when `user` has neither institution nor group set.
 */
export function membershipConditions(user) {
  const conditions = [];
  if (user?.institution) conditions.push({ institution: user.institution });
  if (user?.group) conditions.push({ group: user.group });
  return conditions;
}

// Errors carry the HTTP status and body the handler should send, so the
// route contracts stay exactly as they were when this logic lived inline.
function fail(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

// A group must belong to the person's institution. Only checked when this
// update changes either one, so a stored mismatch doesn't block saving
// unrelated fields.
function assertGroupFitsInstitution(current, updateFields) {
  const institution = updateFields.institution ?? current.institution ?? '';
  const group = updateFields.group ?? current.group ?? '';
  const changed = institution !== (current.institution || '') || group !== (current.group || '');
  if (changed && !groupFitsInstitution(group, institution)) {
    throw fail(400, 'That group belongs to another institution.', 'group_institution_mismatch');
  }
}

const MEMBERSHIP_FIELDS = { institution: 1, group: 1, preferences: 1 };
const PROFILE_FIELDS = { email: 1, role: 1, active: 1, ...MEMBERSHIP_FIELDS };

const toProfile = (user) => ({
  email: user.email,
  role: user.role,
  active: Boolean(user.active),
  ...normalizeMembershipProfile(user)
});

const toAssignee = (user) => ({
  id: user._id.toString(),
  email: user.email,
  institution: user.institution || '',
  group: user.group || ''
});

// Picker order: you, then your group, then your institution, then the QA
// group, then (admins only) everyone else - alphabetical within each block. `relation` is what
// ChatDashboardPage.js groups the <optgroup>s by. Group outranks
// institution because it's the narrower team; someone in both counts as
// group.
const RELATION_RANK = { self: 0, group: 1, institution: 2, qa: 3, other: 4 };

function relationTo(self, selfId, user) {
  if (user._id.toString() === String(selfId)) return 'self';
  if (self?.group && user.group === self.group) return 'group';
  if (self?.institution && user.institution === self.institution) return 'institution';
  if (user.group === QA_GROUP) return 'qa';
  return 'other';
}

function orderAssignees(users, selfId, self) {
  return users
    .map((u) => ({ ...toAssignee(u), relation: relationTo(self, selfId, u) }))
    .sort((a, b) => RELATION_RANK[a.relation] - RELATION_RANK[b.relation] || a.email.localeCompare(b.email));
}

class UserServiceClass {
  // Session user (userId/email/role from config/passport.js) only carries
  // what's in the session; institution, group and preferences are read
  // fresh here so an admin's or the user's own change shows on the next
  // page load without re-authenticating. Empty object when not found.
  async getMembershipProfile(userId) {
    await dbConnect();
    const user = await User.findById(userId, MEMBERSHIP_FIELDS).lean();
    return user ? normalizeMembershipProfile(user) : {};
  }

  async getProfile(userId) {
    await dbConnect();
    const user = await User.findById(userId, PROFILE_FIELDS).lean();
    if (!user) throw fail(404, 'User not found');
    return toProfile(user);
  }

  // Self-service: institution, group and preferences. Role/active stay
  // admin-only via adminUpdateUser. Same validators as the admin path so
  // both write the same values.
  //
  // Institution/group are one-time self-picks for a partner: makes the
  // first self-assign easy (no admin has to set it up front), but once set,
  // only an admin (adminUpdateUser, no lock there) can move the partner
  // elsewhere - stops a partner reassigning themselves out of a
  // chat-assignment scope after the fact. Admins aren't restricted, since
  // they already have authority to change this via the admin path anyway.
  async updateOwnProfile(userId, { institution, group, preferences } = {}) {
    await dbConnect();
    const currentUser = await User.findById(userId, { role: 1, institution: 1, group: 1 }).lean();
    if (!currentUser) throw fail(404, 'User not found');
    const isLockedPartner = currentUser.role !== 'admin';

    const updateFields = {};
    if (institution !== undefined) {
      const value = normalizeInstitution(institution);
      if (value === null) throw fail(400, 'Invalid institution');
      if (isLockedPartner && currentUser.institution && value !== currentUser.institution) {
        throw fail(403, 'Ask an admin to change your institution.', 'institution_locked');
      }
      updateFields.institution = value;
    }
    if (group !== undefined) {
      const value = normalizeGroup(group);
      if (value === null) throw fail(400, 'Invalid group');
      if (isLockedPartner && currentUser.group && value !== currentUser.group) {
        throw fail(403, 'Ask an admin to change your group.', 'group_locked');
      }
      // Every partner can assign to QA members, so only an admin adds people to it.
      if (isLockedPartner && value === QA_GROUP && currentUser.group !== QA_GROUP) {
        throw fail(403, 'Ask an admin to join the QA group.', 'group_locked');
      }
      updateFields.group = value;
    }
    assertGroupFitsInstitution(currentUser, updateFields);
    // A prefilter needs a field to prefilter to - the effective value after
    // this request (a same-request institution/group wins over the stored
    // one). Mirrors the clear rule in applyClearedPrefilters, which turns
    // the preference off when the field is cleared.
    const effective = {
      prefilterDepartment: updateFields.institution !== undefined ? updateFields.institution : currentUser.institution,
      prefilterGroup: updateFields.group !== undefined ? updateFields.group : currentUser.group
    };
    for (const key of ['prefilterDepartment', 'prefilterGroup']) {
      if (preferences?.[key] === undefined) continue;
      if (typeof preferences[key] !== 'boolean') {
        throw fail(400, `preferences.${key} must be a boolean`);
      }
      if (preferences[key] === true && !effective[key]) {
        throw fail(400, `preferences.${key} needs ${key === 'prefilterDepartment' ? 'an institution' : 'a group'} to be set`);
      }
      updateFields[`preferences.${key}`] = preferences[key];
    }
    applyClearedPrefilters(updateFields);
    if (Object.keys(updateFields).length === 0) throw fail(400, 'No valid fields to update');

    const user = await User.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true, select: Object.keys(PROFILE_FIELDS).join(' ') }
    ).lean();
    if (!user) throw fail(404, 'User not found');
    return toProfile(user);
  }

  async listUsers() {
    await dbConnect();
    return User.find({}, { password: 0 }).sort({ createdAt: -1 });
  }

  async adminUpdateUser(userId, { active, role, institution, group } = {}) {
    const updateFields = {};
    if (typeof active === 'boolean') updateFields.active = active;
    if (role && typeof role === 'string') updateFields.role = role;
    if (institution !== undefined) {
      const value = normalizeInstitution(institution);
      if (value === null) throw fail(400, 'Invalid institution');
      updateFields.institution = value;
    }
    if (group !== undefined) {
      const value = normalizeGroup(group);
      if (value === null) throw fail(400, 'Invalid group');
      updateFields.group = value;
    }
    applyClearedPrefilters(updateFields);
    if (Object.keys(updateFields).length === 0) throw fail(400, 'No valid fields to update');

    await dbConnect();
    userId = requireObjectIdString(userId, 'user ID');
    if (updateFields.institution !== undefined || updateFields.group !== undefined) {
      const current = await User.findById(userId, { institution: 1, group: 1 }).lean();
      if (!current) throw fail(404, 'User not found');
      assertGroupFitsInstitution(current, updateFields);
    }
    const user = await User.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true, select: '-password' }
    );
    if (!user) throw fail(404, 'User not found');
    return user;
  }

  async deleteUser(userId) {
    await dbConnect();
    const user = await User.findByIdAndDelete(requireObjectIdString(userId, 'user ID'));
    if (!user) throw fail(404, 'User not found');
  }

  // Who `requester` ({ userId, role }) may assign a question to. Not the
  // full directory (listUsers stays admin-only): a partner only sees people
  // sharing their institution or group, plus the QA group (same rule
  // chat-assign-interaction.js enforces via canAssignTo), plus themselves -
  // self-assign is always allowed there, so the requester is always in the
  // list. An admin sees everyone active.
  //
  // `reason: 'no_institution'` means a partner with neither institution nor
  // group set: the list is only themselves and the QA group, and the
  // frontend uses the reason to explain why no teammates show up.
  //
  // TODO(design): whether partners may assign outside their group at all
  // (group-only assigning) would be an admin-level team setting, not a
  // per-user preference. If it's ever wanted, gate membershipConditions and
  // sharesMembership on that setting - not on the account page's "use your
  // group" checkbox, which only changes what a user sees.
  async listAssignable(requester) {
    await dbConnect();
    const baseQuery = { active: true, role: { $in: ['partner', 'admin'] } };
    const projection = { email: 1, institution: 1, group: 1 };
    const self = await User.findById(requester.userId, { institution: 1, group: 1 }).lean();

    if (requester.role === 'admin') {
      const users = await User.find(baseQuery, projection).lean();
      return { users: orderAssignees(users, requester.userId, self) };
    }

    const conditions = membershipConditions(self);
    const noInstitutionOrGroup = conditions.length === 0;
    conditions.push({ _id: requester.userId }, { group: QA_GROUP });

    const users = await User.find({ ...baseQuery, $or: conditions }, projection).lean();
    return { users: orderAssignees(users, requester.userId, self), ...(noInstitutionOrGroup ? { reason: 'no_institution' } : {}) };
  }
}

// Clearing institution/group has to clear the matching prefilter preference
// too - otherwise the checkbox stays checked (stale server-side, not just a
// stale UI value) for a filter that no longer has anything to prefilter to.
// Runs after any same-request preferences value so it always wins.
function applyClearedPrefilters(updateFields) {
  if (updateFields.institution === '') updateFields['preferences.prefilterDepartment'] = false;
  if (updateFields.group === '') updateFields['preferences.prefilterGroup'] = false;
}

const UserService = new UserServiceClass();
export default UserService;
