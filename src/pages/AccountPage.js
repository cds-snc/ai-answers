import React, { useCallback, useEffect, useState } from 'react';
import DataTable from 'datatables.net-react';
import 'datatables.net-dt/css/dataTables.dataTables.css';
import DT from 'datatables.net-dt';
import { GcdsContainer, GcdsLink, GcdsText } from '@gcds-core/components-react';
import { dataTableLanguage } from '../utils/dataTableLanguage.js';
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
import { useAuth } from '../contexts/AuthContext.js';

DataTable.use(DT);

// The signed-in user's own account: who they are and which institution /
// group an admin has placed them in. Read fresh from the server on every
// visit (the session object doesn't carry institution/group).
const AccountPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [prefStatus, setPrefStatus] = useState(null); // { text, isError }
  const [groupChatsError, setGroupChatsError] = useState(null);
  const [profileStatus, setProfileStatus] = useState(null); // { text, isError }
  const [saving, setSaving] = useState(false);
  // Field-level validation for the pre-filter checkbox: it needs an
  // institution first.
  const prefError = useInlineFormError();
  const groupPrefError = useInlineFormError();
  // refreshUser re-reads auth-me so FilterPanel sees the new preference on
  // the next dashboard visit without a full reload.
  const refreshUser = useAuth()?.refreshUser;

  useEffect(() => {
    let didCancel = false;
    UserService.getMe()
      .then((data) => { if (!didCancel) setProfile(data); })
      .catch((error) => {
        console.error('Error loading account profile:', error);
        if (!didCancel) setLoadError(true);
      })
      .finally(() => { if (!didCancel) setLoading(false); });
    return () => { didCancel = true; };
  }, []);

  // One save path for every self-service field; `setStatus` picks which
  // StatusMessage (profile vs preferences) reports the outcome, and the
  // matching saved/error copy.
  const saveProfile = async (updates, setStatus, savedKey, errorKey) => {
    setSaving(true);
    setStatus(null);
    try {
      const updated = await UserService.updateMe(updates);
      setProfile(updated);
      if (refreshUser) await refreshUser();
      setStatus({ text: t(savedKey), isError: false });
    } catch (error) {
      console.error('Error saving account:', error);
      setStatus({ text: t(errorKey), isError: true });
    } finally {
      setSaving(false);
    }
  };
  const handleProfileFieldChange = (field, value) =>
    saveProfile({ [field]: value }, setProfileStatus, 'account.profileSaved', 'account.profileSaveError');
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

  // Group chats: chats created or evaluated by anyone in the user's group,
  // via the shared reviewer filter (api/util/reviewer-filter.js) on the
  // chat-dashboard endpoint. Last 12 months - the endpoint needs a range.
  const groupName = profile?.group || '';
  const fetchGroupChats = useCallback(async ({ start, length, search, orderBy, orderDir }) => {
    const end = new Date();
    const startDate = new Date(end);
    startDate.setFullYear(end.getFullYear() - 1);
    const result = await DashboardService.getChatDashboard({
      group: groupName,
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
  }, [groupName]);

  // Same Creator / Expert columns as EvalDashboardPage.js: the signed-in
  // account that asked, and the expert who evaluated (blank when not yet).
  const renderEmail = (value) => (value ? `<span lang="en">${escapeHtmlAttribute(value)}</span>` : '');
  // Column order matches the assigned-chats table below: Chat ID, # first.
  // Same DataTables layout as the Chat/Eval dashboards: search top-left,
  // page length + info bottom-left, paging bottom-right.
  const dashboardLayout = {
    topStart: 'search',
    topEnd: {},
    bottomStart: { features: ['pageLength', 'info'] },
    bottomEnd: 'paging',
  };
  const groupChatColumns = [
    {
      title: t('admin.common.columns.chatId'),
      data: 'chatId',
      orderable: false,
      render: (value, type, row) => (value ? buildChatReviewLinkHtml(value, chatLangFromPageLanguage(row.pageLanguage), row.interactionId, lang) : ''),
    },
    { title: t('admin.evalDashboard.columns.questionNumber'), data: 'questionNumber', orderable: false },
    // Public vs signed-in (admin/partner) asker - same split as the
    // dashboards' Users filter, so a blank Creator reads as "public", not
    // "missing".
    {
      title: t('admin.common.columns.user'),
      data: 'userType',
      orderable: false,
      render: (value) => escapeHtmlAttribute(t(value === 'admin' ? 'admin.filters.adminUsers' : 'admin.filters.publicUsers')),
    },
    { title: t('admin.evalDashboard.columns.creatorEmail'), data: 'creatorEmail', orderable: false, render: renderEmail },
    { title: t('admin.evalDashboard.columns.expertEmail'), data: 'reviewerEmail', orderable: false, render: renderEmail },
  ];

  // Placeholder for chat assignment (issue #1656, not built yet): the table
  // shape is real so the page reads the way it will, but there is no data
  // source - the empty-table message says so.
  const assignedChatColumns = [
    { title: t('admin.common.columns.chatId'), data: 'chatId' },
    { title: t('admin.common.columns.program'), data: 'program' },
    { title: t('account.assignedChats.columns.assignedOn'), data: 'assignedOn' },
    { title: t('account.assignedChats.columns.assignedBy'), data: 'assignedBy' },
    { title: t('account.assignedChats.columns.partnerNotes'), data: 'partnerNotes' },
  ];

  const roleLabel = profile?.role ? t(`users.roles.${profile.role}`) : '';
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <GcdsContainer layout="page" className="mb-600">
      <h1 className="mb-400">{t('account.title')}</h1>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
      </nav>

      <section className="mb-400">
        <h2 className="mb-400">{t('account.profileHeading')}</h2>

        {loading && <StatusMessage loading message={t('common.loading')} />}
        {loadError && <StatusMessage message={t('account.loadError')} isError />}

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
                  <select
                    id="account-institution"
                    className="filter-select filter-select--narrow"
                    value={profile.institution || ''}
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
                  <select
                    id="account-group"
                    className="filter-select filter-select--narrow"
                    value={profile.group || ''}
                    onChange={(e) => { groupPrefError.clearError(); handleProfileFieldChange('group', e.target.value); }}
                  >
                    <option value="">{t('users.groupNone')}</option>
                    {PARTNER_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </dd>
              </div>
              {memberSince && (
                <div className="account-profile__row">
                  <dt>{t('account.memberSince')}</dt>
                  <dd>{memberSince}</dd>
                </div>
              )}
            </dl>
            <StatusMessage persistent message={profileStatus?.text || ''} isError={Boolean(profileStatus?.isError)} />
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
          <StatusMessage persistent message={prefStatus?.text || ''} isError={Boolean(prefStatus?.isError)} />
        </section>
      )}
      <h2 className="mb-400">{t('account.activityHeading')}</h2>

      {groupName && (
        <details className="details-form">
          <summary>
            {t('account.groupChats.heading').replace('{group}', groupName)}
            <span className="account-badge account-badge--tip">{t('account.groupChats.underReview')}</span>
          </summary>
          <GcdsText>{t('account.groupChats.description')}</GcdsText>
          {groupChatsError && <StatusMessage message={t('account.groupChats.loadError')} isError />}
          <ServerDataTable
            tableKey={`group-chats-${groupName}`}
            caption={t('account.groupChats.heading').replace('{group}', groupName)}
            lang={lang}
            columns={groupChatColumns}
            fetchData={fetchGroupChats}
            order={[]}
            ordering={false}
            layout={dashboardLayout}
            containerClassName="dashboard-table-container dashboard-table-container--contained"
            emptyTableText={t('account.groupChats.empty')}
            onError={(err) => setGroupChatsError(err)}
          />
        </details>
      )}

      <details className="details-form mb-400">
        <summary>
          {t('account.assignedChats.heading')}
          <span className="account-badge">{t('account.assignedChats.comingSoon')}</span>
        </summary>
        <GcdsText>{t('account.assignedChats.description')}</GcdsText>
        <div className="dashboard-table-container dashboard-table-container--contained">
        <DataTable
          data={[]}
          columns={assignedChatColumns}
          className="display dashboard-table"
          options={{
            paging: true,
            searching: true,
            ordering: false,
            info: true,
            layout: dashboardLayout,
            language: {
              ...dataTableLanguage(lang),
              emptyTable: t('account.assignedChats.inProgress'),
              search: t('admin.common.searchLabel'),
              searchPlaceholder: t('admin.common.searchPlaceholder'),
            },
          }}
        >
          <caption className="sr-only">{t('account.assignedChats.heading')}</caption>
        </DataTable>
        </div>
      </details>

    </GcdsContainer>
  );
};

export default AccountPage;
