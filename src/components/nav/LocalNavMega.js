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

function NavLink({ href, label }) {
  return (
    <li role="none">
      <a
        className="local-nav-item-link local-nav-item-link--sub"
        href={href}
        role="menuitem"
        tabIndex={-1}
      >
        {label}
      </a>
    </li>
  );
}

function NavGroup({ label, children }) {
  return (
    <li role="none" className="local-nav-mega-col">
      <span className="local-nav-group-label" aria-hidden="true">{label}</span>
      <ul role="none" className="local-nav-mega-col-items">
        {children}
      </ul>
    </li>
  );
}

export default function LocalNavMega({ lang = 'en' }) {
  const { currentUser, logout } = useAuth();
  const { t } = useTranslations(lang);
  const { isOpen, toggle, close, triggerRef, menuRef, onMenuKeyDown, onTriggerKeyDown } = useLocalNav();

  const isAdmin = currentUser?.role === 'admin';
  const showAdmin = isAdmin;

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
              {/* ── Use AI — full-width top row ──────────────────────────────── */}
              <li role="none" className="local-nav-mega-primary">
                <a
                  className="local-nav-item-link local-nav-item-link--primary"
                  href={`/${lang}`}
                  role="menuitem"
                  tabIndex={-1}
                >
                  {t('localNav.items.useAI')}
                </a>
              </li>

              {/* ── Columns ─────────────────────────────────────────────────── */}
              <NavGroup label={t('localNav.groups.dashboards')}>
                <NavLink href={getPath('partner-dashboard',   lang)} label={t('localNav.items.partnerDashboard')}   />
                <NavLink href={getPath('eval-dashboard',      lang)} label={t('localNav.items.evalDashboard')}      />
                <NavLink href={getPath('metrics',             lang)} label={t('localNav.items.performanceMetrics')} />
                <NavLink href={getPath('technical-metrics',   lang)} label={t('localNav.items.technicalMetrics')}   />
                {showAdmin && (
                  <>
                    <NavLink href={getPath('exec-dashboard',      lang)} label={t('localNav.items.execDashboard')} />
                    <NavLink href={getPath('auto-eval-dashboard', lang)} label={t('localNav.items.autoEval')}      />
                  </>
                )}
              </NavGroup>

              <NavGroup label={t('localNav.groups.chats')}>
                <NavLink href={getPath('chat-dashboard', lang)} label={t('localNav.items.viewChats')}    />
                <NavLink href={getPath('chat-viewer',    lang)} label={t('localNav.items.fullChatTrace')} />
              </NavGroup>

              <NavGroup label={t('localNav.groups.management')}>
                <NavLink href={getPath('scenario-overrides', lang)} label={t('localNav.items.editScenarios')} />
                <NavLink href={getPath('batch',              lang)} label={t('localNav.items.manageBatches')} />
              </NavGroup>

              {showAdmin && (
                <>
                  <NavGroup label={t('localNav.groups.usersSystem')}>
                    <NavLink href={getPath('users',    lang)} label={t('localNav.items.manageUsers')}    />
                    <NavLink href={getPath('sessions', lang)} label={t('localNav.items.activeSessions')} />
                    <NavLink href={getPath('settings', lang)} label={t('localNav.items.settings')}       />
                  </NavGroup>

                  <NavGroup label={t('localNav.groups.infrastructure')}>
                    <NavLink href={getPath('database',     lang)} label={t('localNav.items.manageDatabase')} />
                    <NavLink href={getPath('vector',       lang)} label={t('localNav.items.vectorAdmin')}    />
                    <NavLink href={getPath('eval',         lang)} label={t('localNav.items.evalAdmin')}      />
                    <NavLink href={getPath('connectivity', lang)} label={t('localNav.items.connectivity')}   />
                  </NavGroup>
                </>
              )}

              {/* ── Sign out — full-width bottom row ─────────────────────────── */}
              <li role="separator" className="local-nav-section-divider local-nav-mega-footer-divider" />
              <li role="none" className="local-nav-mega-footer">
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
