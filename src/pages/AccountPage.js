import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GcdsButton, GcdsContainer, GcdsLink } from '@gcds-core/components-react';
import ServerDataTable from '../components/admin/ServerDataTable.js';
import DashboardService from '../services/DashboardService.js';
import { escapeHtmlAttribute, buildChatReviewLinkHtml, chatLangFromPageLanguage } from '../utils/reviewLink.js';
import { PARTNER_DEPARTMENTS } from '../constants/partnerDepartments.js';
import { PARTNER_GROUPS, getPartnerGroupLabel } from '../constants/partnerGroups.js';
import { useTranslations } from '../hooks/useTranslations.js';
import { getPath } from '../utils/routes.js';
import UserService from '../services/UserService.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import FeedbackInlineError from '../components/chat/FeedbackInlineError.js';
import { useInlineFormError } from '../hooks/useInlineFormError.js';
import { useFocusOnChange } from '../hooks/useFocusOnChange.js';
import { useAuth } from '../contexts/AuthContext.js';
import { buildChatGroupCallbacks, createChatGroupState } from '../utils/admin/chatGroupedTable.js';

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
  const [profileStatus, setProfileStatus] = useState(null); // { text, isError }
  // Institution/group are staged here and written by an explicit Save (SC
  // 3.2.2), never on the select's change event: a closed <select> fires
  // change on every arrow key in Chrome/Firefox, and for a partner the
  // first save locks the value (api/user/user-me.js) - so a keyboard user
  // browsing the list would have been locked into the first option.
  const [draft, setDraft] = useState({ institution: '', group: '' });
  // Every profile write (load, save) resets the draft in the same render so
  // the selects never show a stale value for a frame.
  const applyProfile = (data) => {
    setProfile(data);
    setDraft({ institution: data?.institution || '', group: data?.group || '' });
  };
  const institutionDirty = Boolean(profile) && draft.institution !== (profile.institution || '');
  const groupDirty = Boolean(profile) && draft.group !== (profile.group || '');
  const profileDirty = institutionDirty || groupDirty;
  // Double-submit guard for Save, alongside the visual `disabled` while
  // saving (same as SettingsPage's per-section Save).
  const profileSavingRef = useRef(false);
  // A successful save leaves Save disabled (nothing dirty), so focus would
  // drop to <body>; move it onto the outcome message instead, same counter
  // pattern as UsersPage.js. A failed save keeps the button enabled and
  // focused, so that path announces normally.
  const [profileStatusMovesFocus, setProfileStatusMovesFocus] = useState(false);
  // Same as SettingsPage's per-section Save: greyed and labelled "Saving..."
  // while the request runs.
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveFocusCount, setProfileSaveFocusCount] = useState(0);
  const profileStatusRef = useFocusOnChange(profileSaveFocusCount);
  // Institution/group are one-time self-picks (api/user/user-me.js locks
  // them after the first set) - these surface the 403 as an inline error
  // right on the field rather than
  // a page-level StatusMessage.
  const institutionError = useInlineFormError();
  const groupError = useInlineFormError();
  // refreshUser re-reads auth-me so the signed-in user reflects the change
  // without a full reload.
  const refreshUser = useAuth()?.refreshUser;
  const authUserId = useAuth()?.currentUser?.userId;

  useEffect(() => {
    let didCancel = false;
    UserService.getMe()
      .then((data) => { if (!didCancel) applyProfile(data); })
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

  // Staging only - see `draft`. A fresh edit supersedes the last outcome and
  // any lock error from a previous Save.
  const handleDraftChange = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setProfileStatus(null);
    institutionError.clearError();
    groupError.clearError();
  };
  const handleProfileSave = async () => {
    if (profileSavingRef.current || !profileDirty) return;
    const updates = {};
    if (institutionDirty) updates.institution = draft.institution;
    if (groupDirty) updates.group = draft.group;
    const changes = [];
    if (institutionDirty) {
      changes.push(draft.institution
        ? t('account.changeInstitutionSet').replace('{value}', () => draft.institution)
        : t('account.changeInstitutionCleared'));
    }
    if (groupDirty) {
      changes.push(draft.group
        ? t('account.changeGroupSet').replace('{value}', () => getPartnerGroupLabel(draft.group, lang))
        : t('account.changeGroupCleared'));
    }
    profileSavingRef.current = true;
    setProfileSaving(true);
    setProfileStatus(null);
    try {
      const updated = await UserService.updateMe(updates);
      applyProfile(updated);
      if (refreshUser) await refreshUser();
      setProfileStatusMovesFocus(true);
      setProfileStatus({ text: t('account.updated').replace('{change}', () => changes.join(', ')), isError: false });
      setProfileSaveFocusCount((n) => n + 1);
    } catch (error) {
      console.error('Error saving account:', error);
      setProfileStatusMovesFocus(false);
      // The lock 403 (a race with an admin setting it meanwhile - the field
      // renders read-only once the profile shows it locked) lands on the
      // field itself; anything else is the generic outcome message.
      if (error.code === 'institution_locked') institutionError.triggerError();
      else if (error.code === 'group_locked') groupError.triggerError();
      else setProfileStatus({ text: t('account.profileSaveError'), isError: true });
    } finally {
      profileSavingRef.current = false;
      setProfileSaving(false);
    }
  };
  // Partners get one self-pick per field (api/user/user-me.js); once set,
  // show the value read-only with the "ask an admin" hint up front rather
  // than an enabled select that fails after the fact (SC 3.3.3).
  const institutionLocked = profile?.role !== 'admin' && Boolean(profile?.institution);
  const groupLocked = profile?.role !== 'admin' && Boolean(profile?.group);
  // Same Creator / Expert columns as EvalDashboardPage.js: the signed-in
  // account that asked, and the expert who evaluated (blank when not yet).
  // No lang="en" wrap - email addresses aren't prose, a screen reader's
  // language voice has little effect on them either way.
  const renderEmail = (value) => (value ? escapeHtmlAttribute(value) : '');
  // partnerEval is null/empty until an expert score exists (see
  // getPartnerEvalAggregationExpression) - this column only cares whether
  // that's happened yet, not which category it scored, so it collapses
  // every scored value to one "Completed" pill rather than reusing
  // evalPills.js's category-specific pills.
  const renderEvalStatus = (value) => (value
    ? `<span class="label complete">${escapeHtmlAttribute(t('account.assignedChats.evalStatus.completed'))}</span>`
    : `<span class="label pending">${escapeHtmlAttribute(t('account.assignedChats.evalStatus.pending'))}</span>`);
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
    // No date window: assignments are all-time (chat-dashboard.js only
    // requires one when there's no assignedTo to bound the query).
    const result = await DashboardService.getChatDashboard({
      assignedTo: authUserId,
      includeAssigner: 'true',
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

  const assignedChatColumns = useMemo(() => [
    {
      title: t('admin.common.columns.chatId'),
      data: 'chatId',
      orderable: false,
      render: (value, type, row) => (value ? buildChatReviewLinkHtml(value, chatLangFromPageLanguage(row.pageLanguage), row.interactionId, lang) : ''),
    },
    { title: t('admin.common.columns.program'), data: 'program', render: (value) => escapeHtmlAttribute(value || '') },
    { title: t('account.assignedChats.columns.evaluated'), data: 'partnerEval', render: renderEvalStatus },
    { title: t('account.assignedChats.columns.assignedOn'), data: 'assignedOn', render: (value) => value ? escapeHtmlAttribute(new Date(value).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA')) : '' },
    { title: t('account.assignedChats.columns.assignedBy'), data: 'assignedByEmail', render: renderEmail },
    { title: t('account.assignedChats.columns.partnerNotes'), data: 'assignedNotes', orderable: false, render: (value) => escapeHtmlAttribute(value || '') },
  ], [t, lang]);

  // Same keep-chat-together row grouping as Chat/Eval/AutoEval dashboards
  // (utils/admin/chatGroupedTable.js) - a multi-turn assigned chat produces
  // one row per interaction, and every column here is constant across a
  // chat's rows EXCEPT Evaluated (partnerEval is scored per interaction, so
  // a chat can genuinely be Completed on one turn and Pending on another) -
  // that's the one column left out of groupedColumns below.
  const assignedChatsGroupStateRef = useRef(createChatGroupState());
  const assignedChatsGroupCallbacks = useMemo(() => buildChatGroupCallbacks({
    stateRef: assignedChatsGroupStateRef,
    columns: assignedChatColumns,
    groupedColumns: [
      { data: 'chatId', boundByChatId: false, extraClass: 'chat-id-cell' },
      { data: 'program' },
      { data: 'assignedOn' },
      { data: 'assignedByEmail' },
      { data: 'assignedNotes' },
    ],
  }), [assignedChatColumns]);

  const roleLabel = profile?.role ? t(`users.roles.${profile.role}`) : '';

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
                <dt>{institutionLocked ? t('account.institution') : <label htmlFor="account-institution">{t('account.institution')}</label>}</dt>
                <dd>
                  {institutionLocked ? (
                    <>
                      {profile.institution}
                      <span className="account-profile__hint">{t('account.institutionLocked')}</span>
                    </>
                  ) : (
                    <>
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
                        value={draft.institution}
                        aria-describedby={institutionError.hasError ? 'account-institution-error' : undefined}
                        aria-invalid={institutionError.hasError ? 'true' : undefined}
                        onChange={(e) => handleDraftChange('institution', e.target.value)}
                      >
                        <option value="">{t('users.institutionNone')}</option>
                        {PARTNER_DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </>
                  )}
                </dd>
              </div>
              <div className="account-profile__row">
                <dt>{groupLocked ? t('account.group') : <label htmlFor="account-group">{t('account.group')}</label>}</dt>
                <dd>
                  {groupLocked ? (
                    <>
                      {getPartnerGroupLabel(profile.group, lang)}
                      <span className="account-profile__hint">{t('account.groupLocked')}</span>
                    </>
                  ) : (
                    <>
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
                        value={draft.group}
                        aria-describedby={groupError.hasError ? 'account-group-error' : undefined}
                        aria-invalid={groupError.hasError ? 'true' : undefined}
                        onChange={(e) => handleDraftChange('group', e.target.value)}
                      >
                        <option value="">{t('users.groupNone')}</option>
                        {PARTNER_GROUPS.map((g) => <option key={g} value={g}>{getPartnerGroupLabel(g, lang)}</option>)}
                      </select>
                    </>
                  )}
                </dd>
              </div>
            </dl>
            {!(institutionLocked && groupLocked) && (
              <div className="mb-300">
                {/* Same Save as SettingsPage/UsersPage: GcdsButton, disabled until
                    something is staged. GcdsButton renders `disabled` as
                    aria-disabled (stays focusable), so no focus is lost while
                    it is greyed. */}
                <GcdsButton type="button" disabled={!profileDirty || profileSaving} onClick={handleProfileSave}>
                  {profileSaving ? t('settings.saving') : t('users.actions.save')}
                </GcdsButton>
              </div>
            )}
            <StatusMessage
              ref={profileStatusRef}
              tabIndex={-1}
              announce={!profileStatusMovesFocus}
              announcedVia={profileStatusMovesFocus ? 'focus' : undefined}
              variant={profileStatus?.isError ? 'error' : 'success'}
              message={profileStatus?.text || ''}
            />
          </>
        )}
      </section>

      {profile && (
        <section className="mb-400">
          <h2 className="mb-400">{t('account.activityHeading')}</h2>
          {assignedChatsError && <StatusMessage variant="error" message={t('account.assignedChats.loadError')} />}
          <ServerDataTable
            tableKey={`assigned-chats-${authUserId || 'none'}`}
            caption={t('account.assignedChats.heading')}
            searchLabelSrOnly={t('account.assignedChats.filterLabel')}
            searchPlaceholder={t('admin.common.filterPlaceholder')}
            lang={lang}
            columns={assignedChatColumns}
            fetchData={fetchAssignedChats}
            order={[]}
            grouped
            preDrawCallback={assignedChatsGroupCallbacks.preDrawCallback}
            createdRow={assignedChatsGroupCallbacks.createdRow}
            drawCallback={assignedChatsGroupCallbacks.drawCallback}
            layout={dashboardLayout}
            containerClassName="metrics-table-container table-scroll mt-200"
            onError={(err) => setAssignedChatsError(err)}
          />
        </section>
      )}

    </GcdsContainer>
  );
};

export default AccountPage;
