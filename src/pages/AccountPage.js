import React, { useCallback, useEffect, useState } from 'react';
import { GcdsContainer, GcdsLink } from '@gcds-core/components-react';
import ServerDataTable from '../components/admin/ServerDataTable.js';
import DashboardService from '../services/DashboardService.js';
import { escapeHtmlAttribute, buildChatReviewLinkHtml, chatLangFromPageLanguage } from '../utils/reviewLink.js';
import { PARTNER_DEPARTMENTS } from '../constants/partnerDepartments.js';
import { PARTNER_GROUPS } from '../constants/partnerGroups.js';
import { useTranslations } from '../hooks/useTranslations.js';
import { getPath } from '../utils/routes.js';
import UserService from '../services/UserService.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import FeedbackInlineError from '../components/chat/FeedbackInlineError.js';
import { useInlineFormError } from '../hooks/useInlineFormError.js';
import { useFocusOnChange } from '../hooks/useFocusOnChange.js';
import { useAuth } from '../contexts/AuthContext.js';

// The signed-in user's own account: who they are and which institution /
// group an admin has placed them in. Read fresh from the server on every
// visit (the session object doesn't carry institution/group).
const AccountPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Mount-time check with no adjacent trigger, so it needs its own
  // focus-move (ResetCompletePage.js's invalid-link pattern) - a counter
  // rather than the boolean so a second failed retry still re-fires focus.
  const [loadErrorCount, setLoadErrorCount] = useState(0);
  const loadErrorRef = useFocusOnChange(loadErrorCount);
  const [prefStatus, setPrefStatus] = useState(null); // { text, isError }
  const [profileStatus, setProfileStatus] = useState(null); // { text, isError }
  const [saving, setSaving] = useState(false);
  // Field-level validation for the pre-filter checkbox: it needs an
  // institution first.
  const prefError = useInlineFormError();
  const groupPrefError = useInlineFormError();
  // Institution/group are one-time self-picks (api/user/user-me.js locks
  // them after the first set) - these surface the 403 as an inline error
  // right on the field, same as the pre-filter checkboxes above, rather than
  // a page-level StatusMessage.
  const institutionError = useInlineFormError();
  const groupError = useInlineFormError();
  // refreshUser re-reads auth-me so FilterPanel sees the new preference on
  // the next dashboard visit without a full reload.
  const refreshUser = useAuth()?.refreshUser;
  const authUserId = useAuth()?.currentUser?.userId;

  useEffect(() => {
    let didCancel = false;
    UserService.getMe()
      .then((data) => { if (!didCancel) setProfile(data); })
      .catch((error) => {
        console.error('Error loading account profile:', error);
        if (!didCancel) {
          setLoadError(true);
          setLoadErrorCount((n) => n + 1);
        }
      })
      .finally(() => { if (!didCancel) setLoading(false); });
    return () => { didCancel = true; };
  }, []);

  // One save path for every self-service field; `setStatus` picks which
  // StatusMessage (profile vs preferences) reports the outcome, and the
  // matching saved/error copy. `errorCodeHandlers` lets a specific backend
  // `code` (see UserService.updateMe) be handled instead of falling back to
  // the generic status message - used for the institution/group lock below.
  const saveProfile = async (updates, setStatus, savedKey, errorKey, errorCodeHandlers) => {
    setSaving(true);
    setStatus(null);
    try {
      const updated = await UserService.updateMe(updates);
      setProfile(updated);
      if (refreshUser) await refreshUser();
      setStatus({ text: t(savedKey), isError: false });
    } catch (error) {
      console.error('Error saving account:', error);
      const handled = errorCodeHandlers && error.code && errorCodeHandlers[error.code];
      if (handled) {
        handled();
      } else {
        setStatus({ text: t(errorKey), isError: true });
      }
    } finally {
      setSaving(false);
    }
  };
  const handleProfileFieldChange = (field, value) => {
    institutionError.clearError();
    groupError.clearError();
    return saveProfile(
      { [field]: value },
      setProfileStatus,
      'account.profileSaved',
      'account.profileSaveError',
      { institution_locked: institutionError.triggerError, group_locked: groupError.triggerError }
    );
  };
  const handlePrefilterChange = (checked) => {
    if (checked && !profile?.institution) {
      prefError.triggerError();
      return;
    }
    prefError.clearError();
    return saveProfile({ preferences: { prefilterDepartment: checked } }, setPrefStatus, checked ? 'account.preferences.saved' : 'account.preferences.savedOff', 'account.preferences.saveError');
  };
  const handlePrefilterGroupChange = (checked) => {
    if (checked && !profile?.group) {
      groupPrefError.triggerError();
      return;
    }
    groupPrefError.clearError();
    return saveProfile({ preferences: { prefilterGroup: checked } }, setPrefStatus, checked ? 'account.preferences.saved' : 'account.preferences.savedOff', 'account.preferences.saveError');
  };

  // Same Creator / Expert columns as EvalDashboardPage.js: the signed-in
  // account that asked, and the expert who evaluated (blank when not yet).
  const renderEmail = (value) => (value ? `<span lang="en">${escapeHtmlAttribute(value)}</span>` : '');
  // Same DataTables layout as the Chat/Eval dashboards: search top-left,
  // page length + info bottom-left, paging bottom-right.
  const dashboardLayout = {
    topStart: 'search',
    topEnd: {},
    bottomStart: { features: ['pageLength', 'info'] },
    bottomEnd: 'paging',
  };

  // Chats assigned to the signed-in user (api/chat/chat-assign.js), via the
  // chat-dashboard aggregate's assignedTo filter.
  const [assignedChatsError, setAssignedChatsError] = useState(null);
  const fetchAssignedChats = useCallback(async ({ start, length, search, orderBy, orderDir }) => {
    if (!authUserId) return { data: [], recordsTotal: 0, recordsFiltered: 0 };
    const end = new Date();
    const startDate = new Date(end);
    startDate.setFullYear(end.getFullYear() - 1);
    const result = await DashboardService.getChatDashboard({
      assignedTo: authUserId,
      startDate: startDate.toISOString(),
      endDate: end.toISOString(),
      start,
      length,
      search,
      orderBy: orderBy || 'createdAt',
      orderDir,
    });
    return {
      data: Array.isArray(result?.data) ? result.data : [],
      recordsTotal: result?.recordsTotal || 0,
      recordsFiltered: result?.recordsFiltered || 0,
    };
  }, [authUserId]);

  const assignedChatColumns = [
    {
      title: t('admin.common.columns.chatId'),
      data: 'chatId',
      orderable: false,
      render: (value, type, row) => (value ? buildChatReviewLinkHtml(value, chatLangFromPageLanguage(row.pageLanguage), row.interactionId, lang) : ''),
    },
    { title: t('admin.common.columns.program'), data: 'program', orderable: false, render: (value) => escapeHtmlAttribute(value || '') },
    { title: t('account.assignedChats.columns.assignedOn'), data: 'assignedOn', orderable: false, render: (value) => value ? escapeHtmlAttribute(new Date(value).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA')) : '' },
    { title: t('account.assignedChats.columns.assignedBy'), data: 'assignedByEmail', orderable: false, render: renderEmail },
    { title: t('account.assignedChats.columns.partnerNotes'), data: 'assignedNotes', orderable: false, render: (value) => escapeHtmlAttribute(value || '') },
  ];

  const roleLabel = profile?.role ? t(`users.roles.${profile.role}`) : '';

  // Persistent explainer for the two checkboxes above - department and
  // group are ORed together server-side (api/util/chat-filters.js), not
  // ANDed, so "both on" widens what shows up rather than narrowing it.
  const hasDeptPref = Boolean(profile?.preferences?.prefilterDepartment);
  const hasGroupPref = Boolean(profile?.preferences?.prefilterGroup);
  const prefilterMessageKey = hasDeptPref && hasGroupPref
    ? 'account.preferences.filteredBoth'
    : hasDeptPref
      ? 'account.preferences.filteredInstitution'
      : hasGroupPref
        ? 'account.preferences.filteredGroup'
        : null;

  return (
    <GcdsContainer layout="page" className="mb-600">
      <h1 className="mb-400">{t('account.title')}</h1>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
      </nav>

      <section className="mb-400">
        <h2 className="mb-400">{t('account.profileHeading')}</h2>

        {loading && <StatusMessage loading message={t('common.loading')} />}
        {loadError && (
          <StatusMessage
            variant="error"
            message={t('account.loadError')}
            ref={loadErrorRef}
            tabIndex={-1}
            announce={false}
            announcedVia="focus"
          />
        )}

        {profile && (
          <>
            <dl className="account-profile">
              <div className="account-profile__row">
                <dt>{t('account.accountName')}</dt>
                <dd>{profile.email}</dd>
              </div>
              <div className="account-profile__row">
                <dt>{t('account.role')}</dt>
                <dd>{roleLabel}</dd>
              </div>
              <div className="account-profile__row">
                <dt>{t('account.status')}</dt>
                <dd>{t(`users.status.${profile.active ? 'active' : 'inactive'}`)}</dd>
              </div>
              <div className="account-profile__row">
                <dt><label htmlFor="account-institution">{t('account.institution')}</label></dt>
                <dd>
                  {institutionError.hasError && (
                    <FeedbackInlineError
                      id="account-institution-error"
                      message={t('account.institutionLocked')}
                      errorCount={institutionError.errorCount}
                      inputRef={institutionError.errorRef}
                    />
                  )}
                  <select
                    id="account-institution"
                    className="filter-select filter-select--narrow"
                    value={profile.institution || ''}
                    aria-describedby={institutionError.hasError ? 'account-institution-error' : undefined}
                    aria-invalid={institutionError.hasError ? 'true' : undefined}
                    onChange={(e) => { prefError.clearError(); handleProfileFieldChange('institution', e.target.value); }}
                  >
                    <option value="">{t('users.institutionNone')}</option>
                    {PARTNER_DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </dd>
              </div>
              <div className="account-profile__row">
                <dt><label htmlFor="account-group">{t('account.group')}</label></dt>
                <dd>
                  {groupError.hasError && (
                    <FeedbackInlineError
                      id="account-group-error"
                      message={t('account.groupLocked')}
                      errorCount={groupError.errorCount}
                      inputRef={groupError.errorRef}
                    />
                  )}
                  <select
                    id="account-group"
                    className="filter-select filter-select--narrow"
                    value={profile.group || ''}
                    aria-describedby={groupError.hasError ? 'account-group-error' : undefined}
                    aria-invalid={groupError.hasError ? 'true' : undefined}
                    onChange={(e) => { groupPrefError.clearError(); handleProfileFieldChange('group', e.target.value); }}
                  >
                    <option value="">{t('users.groupNone')}</option>
                    {PARTNER_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </dd>
              </div>
            </dl>
            <StatusMessage variant={profileStatus?.isError ? 'error' : 'success'} message={profileStatus?.text || ''} />
          </>
        )}
      </section>

      {profile && (
        <section className="mb-400">
          <h2 className="mb-0">{t('account.preferences.heading')}</h2>
          <p id="pref-prefilter-department-hint">{t('account.preferences.prefilterDepartmentHint')}</p>
          {prefError.hasError && (
            <FeedbackInlineError
              id="pref-prefilter-department-error"
              message={t('account.preferences.noInstitution')}
              errorCount={prefError.errorCount}
              inputRef={prefError.errorRef}
            />
          )}
          <div className="gc-chckbxrdio md">
            <div className="checkbox">
              <input
                type="checkbox"
                id="pref-prefilter-department"
                checked={Boolean(profile.preferences?.prefilterDepartment)}
                aria-describedby={prefError.hasError ? 'pref-prefilter-department-error pref-prefilter-department-hint' : 'pref-prefilter-department-hint'}
                aria-invalid={prefError.hasError ? 'true' : undefined}
                onChange={(e) => handlePrefilterChange(e.target.checked)}
              />
              <label htmlFor="pref-prefilter-department">{t('account.preferences.prefilterDepartment')}</label>
            </div>
          </div>
          {groupPrefError.hasError && (
            <FeedbackInlineError
              id="pref-prefilter-group-error"
              message={t('account.preferences.noGroup')}
              errorCount={groupPrefError.errorCount}
              inputRef={groupPrefError.errorRef}
            />
          )}
          <div className="gc-chckbxrdio md">
            <div className="checkbox">
              <input
                type="checkbox"
                id="pref-prefilter-group"
                checked={Boolean(profile.preferences?.prefilterGroup)}
                aria-describedby={groupPrefError.hasError ? 'pref-prefilter-group-error pref-prefilter-department-hint' : 'pref-prefilter-department-hint'}
                aria-invalid={groupPrefError.hasError ? 'true' : undefined}
                onChange={(e) => handlePrefilterGroupChange(e.target.checked)}
              />
              <label htmlFor="pref-prefilter-group">{t('account.preferences.prefilterGroup')}</label>
            </div>
          </div>
          <StatusMessage variant={prefStatus?.isError ? 'error' : 'success'} message={prefStatus?.text || ''} />
          {prefilterMessageKey && <StatusMessage variant="info" message={t(prefilterMessageKey)} />}
        </section>
      )}
      {profile && (
        <>
          <h2 className="mb-400">{t('account.activityHeading')}</h2>

          <details className="details-form mb-400">
            <summary>{t('account.assignedChats.heading')}</summary>
            {assignedChatsError && <StatusMessage variant="error" message={t('account.assignedChats.loadError')} />}
            <ServerDataTable
              tableKey={`assigned-chats-${authUserId || 'none'}`}
              caption={t('account.assignedChats.heading')}
              lang={lang}
              columns={assignedChatColumns}
              fetchData={fetchAssignedChats}
              order={[]}
              ordering={false}
              layout={dashboardLayout}
              containerClassName="dashboard-table-container dashboard-table-container--contained"
              emptyTableText={t('account.assignedChats.empty')}
              onError={(err) => setAssignedChatsError(err)}
            />
          </details>
        </>
      )}

    </GcdsContainer>
  );
};

export default AccountPage;
