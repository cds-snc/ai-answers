import React, { useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { useTranslations } from '../../hooks/useTranslations.js';
import { getPath } from '../../utils/routes.js';
import { useLocalNav } from '../../hooks/nav/useLocalNav.js';

function getInitials(email = '') {
  const [local = '', domain = ''] = email.split('@');
  const a = local[0] ?? '';
  const b = domain[0] ?? '';
  return (a + b).toUpperCase() || '?';
}

function NavLink({ href, label, isSubItem }) {
  return (
    <li role="none">
      <a
        className={['local-nav-item-link', isSubItem ? 'local-nav-item-link--sub' : ''].filter(Boolean).join(' ')}
        href={href}
        role="menuitem"
        tabIndex={-1}
      >
        {label}
      </a>
    </li>
  );
}

function GroupLabel({ label }) {
  return (
    <li role="presentation" aria-hidden="true">
      <span className="local-nav-group-label">{label}</span>
    </li>
  );
}

export default function LocalNav({ lang = 'en' }) {
  const { currentUser, logout } = useAuth();
  const { t } = useTranslations(lang);
  const { isOpen, toggle, close, triggerRef, menuRef, onMenuKeyDown, onTriggerKeyDown } = useLocalNav();

  const isAdmin = currentUser?.role === 'admin';
  const showAdmin = isAdmin;
  const isDualRole = showAdmin;

  const handleLogout = useCallback(
    (e) => {
      e.preventDefault();
      close();
      logout();
    },
    [close, logout]
  );

  if (!currentUser) return null;

  const email = currentUser.email ?? '';
  const initials = getInitials(email);

  return (
    <div className="local-nav">
      {/* ── Trigger ─────────────────────────────────────────────────────────── */}
      <button
        ref={triggerRef}
        className="local-nav-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={t('localNav.trigger.ariaLabel')}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="local-nav-avatar" aria-hidden="true">{initials}</span>
        <span className="local-nav-trigger-name">{email}</span>
        <span className="local-nav-caret" aria-hidden="true">
          <i className="fa-solid fa-chevron-down" />
        </span>
      </button>

      {/* ── Menu overlay ────────────────────────────────────────────────────── */}
      {isOpen && (
        <div className="local-nav-overlay">
          {/* Mobile-only top bar — display:none on desktop */}
          <div className="local-nav-mobile-header">
            <span className="local-nav-avatar" aria-hidden="true">{initials}</span>
            <span className="local-nav-mobile-email">{email}</span>
            <button
              className="local-nav-mobile-close"
              type="button"
              onClick={close}
              aria-label={t('localNav.close')}
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>

          <div className="local-nav-mobile-scroll">
            <ul
              ref={menuRef}
              className="local-nav-menu-list"
              role="menu"
              aria-label={t('localNav.trigger.ariaLabel')}
              onKeyDown={onMenuKeyDown}
            >
              {/* ── Partner section ─────────────────────────────────────────── */}
              {isDualRole && (
                <li role="presentation" aria-hidden="true">
                  <div className="local-nav-section-header local-nav-section-header--partner">
                    {t('localNav.partner.sectionLabel')}
                  </div>
                </li>
              )}

              <li role="none">
                <a
                  className="local-nav-item-link local-nav-item-link--primary"
                  href={`/${lang}`}
                  role="menuitem"
                  tabIndex={-1}
                >
                  {t('localNav.items.useAI')}
                </a>
              </li>

              <GroupLabel label={t('localNav.groups.dashboards')} />
              <NavLink href={getPath('partner-dashboard', lang)} label={t('localNav.items.partnerDashboard')}  isSubItem />
              <NavLink href={getPath('eval-dashboard',    lang)} label={t('localNav.items.evalDashboard')}     isSubItem />
              <NavLink href={getPath('metrics',           lang)} label={t('localNav.items.performanceMetrics')} isSubItem />
              <NavLink href={getPath('technical-metrics', lang)} label={t('localNav.items.technicalMetrics')}  isSubItem />

              <GroupLabel label={t('localNav.groups.chats')} />
              <NavLink href={getPath('chat-dashboard', lang)} label={t('localNav.items.viewChats')}    isSubItem />
              <NavLink href={getPath('chat-viewer',    lang)} label={t('localNav.items.fullChatTrace')} isSubItem />

              <GroupLabel label={t('localNav.groups.management')} />
              <NavLink href={getPath('scenario-overrides', lang)} label={t('localNav.items.editScenarios')} isSubItem />
              <NavLink href={getPath('batch',              lang)} label={t('localNav.items.manageBatches')} isSubItem />

              {/* ── Admin section ───────────────────────────────────────────── */}
              {showAdmin && (
                <>
                  <li role="separator" className="local-nav-section-divider" />
                  {isDualRole && (
                    <li role="presentation" aria-hidden="true">
                      <div className="local-nav-section-header local-nav-section-header--admin">
                        {t('localNav.admin.sectionLabel')}
                      </div>
                    </li>
                  )}

                  <GroupLabel label={t('localNav.groups.dashboards')} />
                  <NavLink href={getPath('exec-dashboard',      lang)} label={t('localNav.items.execDashboard')} isSubItem />
                  <NavLink href={getPath('auto-eval-dashboard', lang)} label={t('localNav.items.autoEval')}      isSubItem />

                  <GroupLabel label={t('localNav.groups.usersSystem')} />
                  <NavLink href={getPath('users',    lang)} label={t('localNav.items.manageUsers')}    isSubItem />
                  <NavLink href={getPath('sessions', lang)} label={t('localNav.items.activeSessions')} isSubItem />
                  <NavLink href={getPath('settings', lang)} label={t('localNav.items.settings')}       isSubItem />

                  <GroupLabel label={t('localNav.groups.infrastructure')} />
                  <NavLink href={getPath('database',     lang)} label={t('localNav.items.manageDatabase')} isSubItem />
                  <NavLink href={getPath('vector',       lang)} label={t('localNav.items.vectorAdmin')}    isSubItem />
                  <NavLink href={getPath('eval',         lang)} label={t('localNav.items.evalAdmin')}      isSubItem />
                  <NavLink href={getPath('connectivity', lang)} label={t('localNav.items.connectivity')}   isSubItem />
                </>
              )}

              {/* ── Sign out ────────────────────────────────────────────────── */}
              <li role="separator" className="local-nav-section-divider" />
              <li role="none">
                <button
                  className="local-nav-item-link local-nav-item-link--signout"
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={handleLogout}
                >
                  {t('localNav.items.signOut')}
                </button>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
