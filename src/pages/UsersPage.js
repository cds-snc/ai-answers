import React, { useEffect, useState, useRef, useMemo } from 'react';
import DataTable from 'datatables.net-react';
import 'datatables.net-dt/css/dataTables.dataTables.css';
import DT from 'datatables.net-dt';
import { GcdsButton, GcdsContainer, GcdsLink, GcdsText } from '@gcds-core/components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { dataTableLanguage } from '../utils/dataTableLanguage.js';
import { escapeHtml as escapeHtmlAttribute } from '../utils/htmlEscape.js';
import { setColumnHeaderScope } from '../utils/admin/dataTableAccessibility.js';
import { getCellRoot } from '../utils/dataTableCellRoot.js';
import UserService from '../services/UserService.js';
import { useAuth } from '../contexts/AuthContext.js';
import { usePageContext } from '../hooks/usePageParam.js';
import { useFocusOnChange } from '../hooks/useFocusOnChange.js';
import StatusMessage, { useRepeatableStatus } from '../components/admin/StatusMessage.js';
import { PARTNER_DEPARTMENTS } from '../constants/partnerDepartments.js';
import { PARTNER_GROUPS } from '../constants/partnerGroups.js';

DataTable.use(DT);

const statusOptions = [
  { value: true, sortIndex: 0 },
  { value: false, sortIndex: 1 },
];

// Helper to normalize role values (handles bad data like uppercase 'User' or 'ADMIN')
const normalizeRole = (role) => {
  if (!role) return '';
  return String(role).toLowerCase();
};

// Convert truthy-ish values into booleans, otherwise null for unknowns
const toBooleanish = (value) => {
  if (typeof value === 'string') {
    const cleaned = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(cleaned)) return true;
    if (['false', '0', 'no', 'n'].includes(cleaned)) return false;
    return null;
  }
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return null;
};

const UsersPage = ({ lang }) => {
  const { t } = useTranslations(lang);
  const { language } = usePageContext();
  const roleOptions = useMemo(() => [
    { value: 'admin', label: t('users.roles.admin'), sortIndex: 0 },
    { value: 'partner', label: t('users.roles.partner'), sortIndex: 1 },
  ], [t]);
  const naLabel = t('common.na');
  const [users, setUsers] = useState([]);
  // Use a ref to store edit states persistently between DataTable renders
  const editStatesRef = useRef({});
  // This state is just used to trigger re-renders when editStatesRef changes
  // eslint-disable-next-line no-unused-vars
  const [triggerRender, setTriggerRender] = useState(0);
  // message/isError/nonce for the outcome box below (see useRepeatableStatus).
  // `moveFocus` is separate — not part of this hook, see saveFocusCount below.
  const { message: statusText, isError: statusIsError, nonce: statusNonce, announce: setStatusMessage, clear: clearStatusMessage } = useRepeatableStatus();
  const [statusMovesFocus, setStatusMovesFocus] = useState(false);
  const { currentUser } = useAuth();

  // Per-row Save/Delete <td> refs, captured in createdRow — lets a field
  // edit re-render just that cell (renderActionsCell) instead of a full
  // DataTable redraw.
  const actionCellsRef = useRef({});
  // Per-row { email, role, active } snapshot, captured directly from
  // createdRow's own row data on every redraw (including right after a
  // successful save, when it refreshes to the newly-committed values).
  // While an edit is staged but not yet saved, nothing redraws, so this
  // keeps holding the pre-edit values — exactly the "before" side needed to
  // describe what changed. Read from here rather than looking values up in
  // `users` state at save/delete time.
  const userSnapshotsRef = useRef({});
  // Functional double-submit guard for Save, not a visual `disabled` — that
  // would drop focus off the just-clicked button; see handleSave.
  const savingRef = useRef(new Set());

  // Bumped on save/delete completion to move focus onto the outcome message —
  // Save disables itself, Delete removes the row; both would otherwise drop
  // focus to <body>. Same pattern as ScenarioOverridesPage.js.
  const [saveFocusCount, setSaveFocusCount] = useState(0);
  const statusMessageRef = useFocusOnChange(saveFocusCount);

  // Initialize editStates with data from users
  useEffect(() => {
    if (users.length > 0 && Object.keys(editStatesRef.current).length === 0) {
      users.forEach(user => {
        editStatesRef.current[user._id] = {
          role: user.role,
          active: user.active,
          institution: user.institution || '',
          group: user.group || '',
          changed: false
        };
      });
      // Force a re-render to reflect the initial values
      setTriggerRender(prev => prev + 1);
    }
  }, [users]);

  // Re-renders just this row's Save/Delete cell — used after staging so
  // Save's disabled state updates without a full DataTable redraw (which
  // would tear down the <select> mid-arrow-key-browsing).
  const renderActionsCell = (userId) => {
    const cell = actionCellsRef.current[userId];
    if (!cell) return;
    const changed = !!editStatesRef.current[userId]?.changed;
    getCellRoot(cell).render(
      <div className="table-row-actions" style={{ display: 'flex', gap: '8px' }}>
        <GcdsButton size="small" disabled={!changed} onClick={() => handleSave(userId)}>
          {t('users.actions.save')}
        </GcdsButton>
        <GcdsButton size="small" buttonRole="danger" onClick={() => handleDelete(userId)}>
          {t('users.actions.delete')}
        </GcdsButton>
      </div>
    );
  };

  const handleFieldChange = (userId, field, value) => {
    // Clear any leftover outcome from a previous save/delete — silent (no
    // announcement, no focus move), since a stale "User A updated" while
    // now editing User B is misleading, but pulling focus off the select
    // they're actively using would be worse.
    clearStatusMessage();

    // Doesn't touch `users`/DataTable's data — render() already reads live
    // values from here, so staging needs no redraw (that's what avoids
    // tearing down the <select> mid-browse).
    if (!editStatesRef.current[userId]) {
      const matchingUser = users.find(u => u._id === userId);
      editStatesRef.current[userId] = {
        role: matchingUser?.role || '',
        active: matchingUser?.active || false,
        institution: matchingUser?.institution || '',
        group: matchingUser?.group || ''
      };
    }
    const edit = editStatesRef.current[userId];
    edit[field] = value;

    // Diff against last-committed snapshot, not a flat true — a revert back
    // to the original value must disable Save again (see SettingsPage.js's
    // stageChange).
    const original = userSnapshotsRef.current[userId];
    edit.changed = !original
      || normalizeRole(edit.role) !== normalizeRole(original.role)
      || toBooleanish(edit.active) !== toBooleanish(original.active)
      || edit.institution !== (original.institution || '')
      || edit.group !== (original.group || '');

    renderActionsCell(userId);
  };

  const handleSave = async (userId) => {
    // Functional guard against a double-click firing two overlapping saves —
    // see savingRef's own comment for why this isn't a visual `disabled`.
    if (savingRef.current.has(userId)) return;

    const edit = editStatesRef.current[userId];
    if (!edit || !edit.changed) return;

    // The shared message box up top isn't tied to any one row, so name the
    // user in it — falls back to the id if a snapshot was somehow never
    // captured. `original` is the pre-edit committed values, used below to
    // describe which field(s) actually changed.
    const original = userSnapshotsRef.current[userId];
    const email = original?.email || userId;

    savingRef.current.add(userId);
    try {
      const updatedUser = await UserService.update(userId, {
        active: edit.active,
        role: edit.role,
        institution: edit.institution,
        group: edit.group
      });

      // Update users array — this does redraw the table, but only once per
      // deliberate Save click rather than per keystroke.
      setUsers(prevUsers => prevUsers.map(u => u._id === userId ? updatedUser : u));
      editStatesRef.current[userId].changed = false;
      // This redraw disables the Save button the user just clicked, so
      // reclaim focus onto this message instead of announcing normally.
      setStatusMovesFocus(true);

      // Name which field(s) actually changed rather than a bare
      // confirmation — falls back to the generic message if nothing
      // textually differs (e.g. re-picking the same value).
      const parts = [];
      if (original && normalizeRole(original.role) !== normalizeRole(updatedUser.role)) {
        const roleLabel = roleOptions.find(o => o.value === normalizeRole(updatedUser.role))?.label || naLabel;
        parts.push(t('users.actions.saveSuccessRole').replace('{email}', () => email).replace('{role}', () => roleLabel));
      }
      if (original && toBooleanish(original.active) !== toBooleanish(updatedUser.active)) {
        const statusLabel = t('users.status.' + (toBooleanish(updatedUser.active) ? 'active' : 'inactive'));
        parts.push(t('users.actions.saveSuccessStatus').replace('{email}', () => email).replace('{status}', () => statusLabel));
      }
      const successMessage = parts.length ? parts.join(' ') : t('users.actions.saveSuccess').replace('{email}', () => email);
      setStatusMessage(successMessage, { isError: false });
      setSaveFocusCount(prev => prev + 1);
    } catch (error) {
      console.error('Error updating user:', error);
      // Nothing redraws here — the row/button are untouched, so focus is
      // still right where the user left it. Announce normally instead of
      // moving focus.
      setStatusMovesFocus(false);
      setStatusMessage(t('users.actions.saveError').replace('{email}', () => email), { isError: true });
    } finally {
      savingRef.current.delete(userId);
    }
  };
  const handleDelete = async (userId) => {
    // Check if user has admin role
    if (currentUser?.role !== 'admin') {
      alert(t('users.actions.adminOnly'));
      return;
    }

    if (!window.confirm(t('users.actions.confirmDelete'))) return;

    // Captured before the delete — once it succeeds, this user is gone and
    // there's nothing left to read the snapshot from.
    const email = userSnapshotsRef.current[userId]?.email || userId;

    try {
      await UserService.delete(userId);

      // Remove from users array
      setUsers(prevUsers => prevUsers.filter(u => u._id !== userId));
      // Remove from refs
      delete editStatesRef.current[userId];
      delete actionCellsRef.current[userId];
      delete userSnapshotsRef.current[userId];
      // The row (and the Delete button just clicked) is gone from the DOM,
      // so reclaim focus onto this message instead of announcing normally.
      setStatusMovesFocus(true);
      setStatusMessage(t('users.actions.deleteSuccess').replace('{email}', () => email), { isError: false });
      setSaveFocusCount(prev => prev + 1);
    } catch (error) {
      console.error('Error deleting user:', error);
      // The row is untouched on a failed delete, so focus is still on the
      // Delete button — announce normally instead of moving focus.
      setStatusMovesFocus(false);
      setStatusMessage(t('users.actions.deleteError').replace('{email}', () => email), { isError: true });
    }
  };

  useEffect(() => {
    let didCancel = false;

    const fetchUsers = async () => {
      try {
        const data = await UserService.getAll();
        if (!didCancel) {
          // Normalize role casing and coerce active flags for consistent sorting
          const sanitized = data.map(user => ({
            ...user,
            role: normalizeRole(user.role),
            active: toBooleanish(user.active),
          }));
          setUsers(sanitized);
        }
      } catch (error) {
        if (!didCancel) {
          console.error('Error fetching users:', error);
        }
      }
    };

    fetchUsers();
    return () => { didCancel = true; };
  }, []);

  const columns = [
    { title: t('users.columns.email'), data: 'email' },
    {
      title: t('users.columns.role'),
      data: 'role',
      render: (data, type, row) => {
        const userId = row._id;
        const rawValue = editStatesRef.current[userId]?.role ?? data;
        // Normalize the role value to handle bad data (e.g., 'User' vs 'user')
        const value = normalizeRole(rawValue);

        const option = roleOptions.find(opt => opt.value === value);
        // If role isn't a known option (including legacy 'user'), show N/A
        const label = option ? option.label : naLabel;

        // For sorting/filtering, return a consistent sortable value
        if (type === 'sort' || type === 'type') {
          return option ? option.sortIndex : 999; // Unknown roles sort last
        }
        if (type === 'filter') {
          return label;
        }

        if (type === 'display') {
          const optionsHtml = roleOptions.map(opt => `<option value="${opt.value}"${opt.value === value ? ' selected' : ''}>${opt.label}</option>`).join('');
          const isKnownKey = roleOptions.some(opt => opt.value === value);
          // For unknown roles (including 'user'), show N/A placeholder with empty value
          const extraOption = !isKnownKey ? `<option value="" selected>${naLabel}</option>` : '';
          const ariaLabel = escapeHtmlAttribute(`${t('users.columns.role')} — ${row.email || userId}`);

          return `<select data-userid="${userId}" data-field="role" aria-label="${ariaLabel}" style="width: 100%">${extraOption}${optionsHtml}</select>`;
        }
        return label;
      }
    },
    {
      title: t('users.columns.status'),
      data: 'active',
      render: (data, type, row) => {
        const userId = row._id;
        const rawValue = editStatesRef.current[userId]?.active ?? data;
        const value = toBooleanish(rawValue);
        const option = statusOptions.find(opt => opt.value === value);
        const label = option
          ? t('users.status.' + (value ? 'active' : 'inactive'))
          : (rawValue !== undefined && rawValue !== null ? String(rawValue) : naLabel);

        // For sorting, return a consistent sortable value (Active=0, Inactive=1)
        if (type === 'sort' || type === 'type') {
          return option ? option.sortIndex : 999;
        }
        if (type === 'filter') {
          return label;
        }

        if (type === 'display') {
          // Only show N/A placeholder when status is unknown; otherwise show the two known options
          const placeholder = option ? '' : `<option value="" selected>${naLabel}</option>`;
          const optionsHtml = statusOptions.map(opt => `<option value="${opt.value}"${opt.value === value ? ' selected' : ''}>${t('users.status.' + (opt.value ? 'active' : 'inactive'))}</option>`).join('');
          const ariaLabel = escapeHtmlAttribute(`${t('users.columns.status')} — ${row.email || userId}`);
          return `<select data-userid="${userId}" data-field="active" aria-label="${ariaLabel}" style="width: 100%">${placeholder}${optionsHtml}</select>`;
        }
        return label;
      }
    },
    {
      title: t('users.columns.institution'),
      data: 'institution',
      render: (data, type, row) => {
        const userId = row._id;
        const value = editStatesRef.current[userId]?.institution ?? data ?? '';
        const label = value || t('users.institutionNone');
        if (type === 'display') {
          const noneOption = `<option value=""${value === '' ? ' selected' : ''}>${escapeHtmlAttribute(t('users.institutionNone'))}</option>`;
          const optionsHtml = PARTNER_DEPARTMENTS.map(d => `<option value="${d}"${d === value ? ' selected' : ''}>${d}</option>`).join('');
          const ariaLabel = escapeHtmlAttribute(`${t('users.columns.institution')} — ${row.email || userId}`);
          return `<select data-userid="${userId}" data-field="institution" aria-label="${ariaLabel}" style="width: 100%">${noneOption}${optionsHtml}</select>`;
        }
        return label;
      }
    },
    {
      // TODO: groups are a hardcoded PARTNER_GROUPS list; add a "manage
      // groups" page/section here to create/edit them instead.
      title: t('users.columns.group'),
      data: 'group',
      render: (data, type, row) => {
        const userId = row._id;
        const value = editStatesRef.current[userId]?.group ?? data ?? '';
        const label = value || t('users.groupNone');
        if (type === 'display') {
          const noneOption = `<option value=""${value === '' ? ' selected' : ''}>${escapeHtmlAttribute(t('users.groupNone'))}</option>`;
          const optionsHtml = PARTNER_GROUPS.map(g => `<option value="${escapeHtmlAttribute(g)}"${g === value ? ' selected' : ''}>${escapeHtmlAttribute(g)}</option>`).join('');
          const ariaLabel = escapeHtmlAttribute(`${t('users.columns.group')} — ${row.email || userId}`);
          return `<select data-userid="${userId}" data-field="group" aria-label="${ariaLabel}" style="width: 100%">${noneOption}${optionsHtml}</select>`;
        }
        return label;
      }
    },
    {
      title: t('users.columns.createdAt'),
      data: 'createdAt',
      render: (data) => new Date(data).toLocaleDateString()
    },
    {
      title: t('users.columns.actions'),
      data: null,
      defaultContent: '',
    },
  ];
  return (
    <GcdsContainer layout="page" className="mb-600">
      <h1 className="mb-400">{t('users.title')}</h1>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
        </GcdsText>
      </nav>

      {/* statusMovesFocus is true only for successful save/delete (both
          redraw and drop focus off the just-used control); a failed
          save/delete touches nothing, so this just announces normally. */}
      <StatusMessage
        ref={statusMessageRef}
        tabIndex={-1}
        announce={!statusMovesFocus}
        announcedVia={statusMovesFocus ? 'focus' : undefined}
        variant={statusText ? (statusIsError ? 'error' : 'success') : undefined}
        message={statusText}
        nonce={statusNonce}
      />

      <div className="metrics-table-container">
      <DataTable
        data={users}
        className="display dashboard-table zebra-stable-on-hover"
        columns={columns}
        options={{
          rowId: '_id',
          paging: true,
          searching: true,
          ordering: true,
          order: [[5, 'desc']],
          // Same zones as the dashboards: filter box top-left, page info +
          // entries-per-page bottom-left, paging bottom-right.
          layout: {
            topStart: 'search',
            topEnd: {},
            bottomStart: { features: ['pageLength', 'info'] },
            bottomEnd: { paging: { firstLast: false } },
          },
          language: {
            ...dataTableLanguage(lang),
            // Filter-style box like the other admin tables: sr-only label,
            // "Filter" placeholder, native x to clear.
            search: `<span class="sr-only">${escapeHtmlAttribute(t('users.filterLabel'))}</span>`,
            searchPlaceholder: t('admin.common.filterPlaceholder'),
          },
          initComplete: function () {
            setColumnHeaderScope(this.api());
          },
          createdRow: (row, data) => {
            // Only stage the edit (handleFieldChange) — an unopened <select>
            // fires `change` on every arrow-key press, so autosaving here
            // could commit an unintended, privilege-escalating role change
            // before the user lands on the one they meant to pick.
            row.querySelectorAll('select[data-field]').forEach(select => {
              select.onchange = () => {
                const userId = select.getAttribute('data-userid');
                const field = select.getAttribute('data-field');
                let value = select.value;
                if (field === 'active') {
                  value = toBooleanish(value);
                }
                handleFieldChange(userId, field, value);
              };
            });

            // Render Save and Delete buttons. getCellRoot() clears any stale
            // content and unmounts a prior root as needed.
            const actionsCell = row.querySelector('td:last-child');
            actionCellsRef.current[data._id] = actionsCell;
            userSnapshotsRef.current[data._id] = { email: data.email, role: data.role, active: data.active, institution: data.institution, group: data.group };
            renderActionsCell(data._id);
          },
        }}
      >
        <caption className="sr-only">{t('users.title')}</caption>
      </DataTable>
      </div>
    </GcdsContainer>
  );
};


export default UsersPage;