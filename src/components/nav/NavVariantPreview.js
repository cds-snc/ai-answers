import React, { useCallback } from 'react';
import { GcdsTopNav, GcdsNavGroup, GcdsNavLink } from '@gcds-core/components-react';
import { useAuth } from '../../contexts/AuthContext.js';
import { useLocalNav } from '../../hooks/nav/useLocalNav.js';
import { useTranslations } from '../../hooks/useTranslations.js';
import { getPath } from '../../utils/routes.js';
import LocalNav from './LocalNav.js';

function getInitials(email = '') {
  return (email[0] ?? '?').toUpperCase();
}

function MobileNavLink({ href, label }) {
  return (
    <li role="none">
      <a className="local-nav-item-link local-nav-item-link--sub" href={href} role="menuitem" tabIndex={-1}>
        {label}
      </a>
    </li>
  );
}

function MobileGroupLabel({ label }) {
  return (
    <li role="presentation" aria-hidden="true">
      <span className="local-nav-group-label">{label}</span>
    </li>
  );
}

// Mobile fallback matching the desktop group structure — no partner/admin section headers.
// Styled to match the GC DS top nav mobile pattern: full-width "Menu" trigger + full-screen overlay.
function NavVariantMobile({ variant, lang, generic = false }) {
  const { t } = useTranslations(lang);
  const { isOpen, toggle, close, triggerRef, menuRef, onMenuKeyDown, onTriggerKeyDown } = useLocalNav();
  const appTitle = generic ? t('navVariant.demo4GenericAppTitle') : t('navVariant.appTitle');
  const groupLabel = generic ? t('navVariant.demo4GenericGroupLabel') : t('navVariant.useAIGroupLabel');
  const subItem = generic ? t('navVariant.demo4GenericSubItem') : t('navVariant.useAISubItem');

  const sigSrc = lang === 'fr' ? '/sig-clr-fr.svg' : '/sig-clr-en.svg';
  const sigAlt = lang === 'fr' ? 'Gouvernement du Canada' : 'Government of Canada';
  const wordmarkSrc = '/wmms-blk.svg';

  return (
    <div className="nav-variant-mobile-nav">
      <button
        ref={triggerRef}
        className="nav-variant-mobile-menu-btn"
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
      >
        {t('navVariant.mobileMenuLabel')}
      </button>

      {isOpen && (
        <div className="local-nav-overlay" onKeyDown={e => e.key === 'Escape' && close()}>
          <div className="local-nav-mobile-scroll">
            {/* Signature row */}
            <div className="nav-variant-mobile-sig-row">
              <img className="nav-variant-mobile-sig" src={sigSrc} alt={sigAlt} />
            </div>
            {/* Close + title */}
            <div className="nav-variant-mobile-header">
              <button
                className="nav-variant-mobile-close-btn"
                type="button"
                onClick={close}
              >
                {t('navVariant.mobileCloseLabel')}
              </button>
              <span className="nav-variant-mobile-header-title">{appTitle}</span>
            </div>
            <ul
              ref={menuRef}
              className="local-nav-menu-list"
              role="menu"
              aria-label={t('localNav.trigger.ariaLabel')}
              onKeyDown={onMenuKeyDown}
            >
              <MobileGroupLabel label={groupLabel} />
              <MobileNavLink href={`/${lang}`} label={subItem} />

              <MobileGroupLabel label={t('localNav.groups.dashboards')} />
              <MobileNavLink href={getPath('partner-dashboard', lang)} label={t('localNav.items.partnerDashboard')} />
              <MobileNavLink href={getPath('eval-dashboard', lang)} label={t('localNav.items.evalDashboard')} />
              <MobileNavLink href={getPath('metrics', lang)} label={t('localNav.items.performanceMetrics')} />
              <MobileNavLink href={getPath('technical-metrics', lang)} label={t('localNav.items.technicalMetrics')} />
              {variant === 'partner-admin' && (
                <>
                  <MobileNavLink href={getPath('exec-dashboard', lang)} label={t('localNav.items.execDashboard')} />
                  <MobileNavLink href={getPath('auto-eval-dashboard', lang)} label={t('localNav.items.autoEval')} />
                </>
              )}

              <MobileGroupLabel label={t('localNav.groups.chats')} />
              <MobileNavLink href={getPath('chat-dashboard', lang)} label={t('localNav.items.viewChats')} />
              <MobileNavLink href={getPath('chat-viewer', lang)} label={t('localNav.items.fullChatTrace')} />

              <MobileGroupLabel label={t('localNav.groups.management')} />
              <MobileNavLink href={getPath('scenario-overrides', lang)} label={t('localNav.items.editScenarios')} />
              <MobileNavLink href={getPath('batch', lang)} label={t('localNav.items.manageBatches')} />

              {variant === 'partner-admin' && (
                <>
                  <MobileGroupLabel label={t('localNav.groups.usersSystem')} />
                  <MobileNavLink href={getPath('users', lang)} label={t('localNav.items.manageUsers')} />
                  <MobileNavLink href={getPath('sessions', lang)} label={t('localNav.items.activeSessions')} />
                  <MobileNavLink href={getPath('settings', lang)} label={t('localNav.items.settings')} />

                  <MobileGroupLabel label={t('localNav.groups.infrastructure')} />
                  <MobileNavLink href={getPath('database', lang)} label={t('localNav.items.manageDatabase')} />
                  <MobileNavLink href={getPath('vector', lang)} label={t('localNav.items.vectorAdmin')} />
                  <MobileNavLink href={getPath('eval', lang)} label={t('localNav.items.evalAdmin')} />
                  <MobileNavLink href={getPath('connectivity', lang)} label={t('localNav.items.connectivity')} />
                </>
              )}

            </ul>
            <div className="nav-variant-mobile-footer">
              <img src={wordmarkSrc} alt="Canada.ca" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Minimal account button — sign out only. Exported so the layout can slot it into the header.
// compact=true: small positioned dropdown (brand band use); false: full-screen overlay (sidebar use).
export function AccountMenu({ lang, overrideEmail, compact = false }) {
  const { currentUser, logout } = useAuth();
  const { t } = useTranslations(lang);
  const { isOpen, toggle, close, triggerRef, menuRef, onMenuKeyDown, onTriggerKeyDown } = useLocalNav();

  const handleLogout = useCallback((e) => {
    e.preventDefault();
    close();
    logout();
  }, [close, logout]);

  if (!currentUser) return null;

  const email = overrideEmail ?? (currentUser.email ?? '');
  const displayName = email;
  const initials = getInitials(email);

  return (
    <div className={compact ? 'account-menu-compact' : 'local-nav'}>
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
        <span className="local-nav-trigger-name">{displayName}</span>
        <span className="local-nav-caret" aria-hidden="true">
          <i className="fa-solid fa-chevron-down" />
        </span>
      </button>

      {isOpen && compact && (
        <ul
          ref={menuRef}
          className="local-nav-menu-list account-menu-compact__dropdown"
          role="menu"
          aria-label={t('localNav.trigger.ariaLabel')}
          onKeyDown={onMenuKeyDown}
        >
          <li role="none">
            <a className="local-nav-item-link" href="#" role="menuitem" tabIndex={-1}>
              {t('localNav.items.managePassword')}
            </a>
          </li>
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
      )}

      {isOpen && !compact && (
        <div className="local-nav-overlay">
          <div className="local-nav-mobile-scroll">
            <ul
              ref={menuRef}
              className="local-nav-menu-list"
              role="menu"
              aria-label={t('localNav.trigger.ariaLabel')}
              onKeyDown={onMenuKeyDown}
            >
              <li role="none">
                <a className="local-nav-item-link" href="#" role="menuitem" tabIndex={-1}>
                  {t('localNav.items.managePassword')}
                </a>
              </li>
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

// Renders the nav bar only — no wrapper box, no labels. Drop directly into a demo page.
export default function NavVariantPreview({ variant = 'partner', lang = 'en', generic = false }) {
  const { t } = useTranslations(lang);
  const submenu = (group) => `${group} ${t('navVariant.submenuLabel')}`;
  const appTitle = generic ? t('navVariant.demo4GenericAppTitle') : t('navVariant.appTitle');
  const groupLabel = generic ? t('navVariant.demo4GenericGroupLabel') : t('navVariant.useAIGroupLabel');
  const subItem = generic ? t('navVariant.demo4GenericSubItem') : t('navVariant.useAISubItem');

  if (variant === 'current') {
    return (
      <div className="nav-variant-current-bar">
        <LocalNav lang={lang} />
      </div>
    );
  }

  return (
    <>
      {/* Desktop: GcdsTopNav */}
      <div className="nav-variant-bar">
        <GcdsTopNav label={t('navVariant.navAriaLabel')} alignment="end">
          <GcdsNavLink href="#" slot="home">{appTitle}</GcdsNavLink>
          <GcdsNavGroup
            openTrigger={groupLabel}
            menuLabel={submenu(groupLabel)}
          >
            <GcdsNavLink href={`/${lang}`}>{subItem}</GcdsNavLink>
          </GcdsNavGroup>

          {/* Dashboards — admin dashboards follow partner dashboards in the combined variant */}
          <GcdsNavGroup
            openTrigger={t('localNav.groups.dashboards')}
            menuLabel={submenu(t('localNav.groups.dashboards'))}
          >
            <GcdsNavLink href={getPath('partner-dashboard', lang)}>{t('localNav.items.partnerDashboard')}</GcdsNavLink>
            <GcdsNavLink href={getPath('eval-dashboard', lang)}>{t('localNav.items.evalDashboard')}</GcdsNavLink>
            <GcdsNavLink href={getPath('metrics', lang)}>{t('localNav.items.performanceMetrics')}</GcdsNavLink>
            <GcdsNavLink href={getPath('technical-metrics', lang)}>{t('localNav.items.technicalMetrics')}</GcdsNavLink>
            {variant === 'partner-admin' && (
              <>
                <GcdsNavLink href={getPath('exec-dashboard', lang)}>{t('localNav.items.execDashboard')}</GcdsNavLink>
                <GcdsNavLink href={getPath('auto-eval-dashboard', lang)}>{t('localNav.items.autoEval')}</GcdsNavLink>
              </>
            )}
          </GcdsNavGroup>

          <GcdsNavGroup
            openTrigger={t('localNav.groups.chats')}
            menuLabel={submenu(t('localNav.groups.chats'))}
          >
            <GcdsNavLink href={getPath('chat-dashboard', lang)}>{t('localNav.items.viewChats')}</GcdsNavLink>
            <GcdsNavLink href={getPath('chat-viewer', lang)}>{t('localNav.items.fullChatTrace')}</GcdsNavLink>
          </GcdsNavGroup>

          <GcdsNavGroup
            openTrigger={t('localNav.groups.management')}
            menuLabel={submenu(t('localNav.groups.management'))}
          >
            <GcdsNavLink href={getPath('scenario-overrides', lang)}>{t('localNav.items.editScenarios')}</GcdsNavLink>
            <GcdsNavLink href={getPath('batch', lang)}>{t('localNav.items.manageBatches')}</GcdsNavLink>
          </GcdsNavGroup>

          {variant === 'partner-admin' && (
            <>
              <GcdsNavGroup
                openTrigger={t('localNav.groups.usersSystem')}
                menuLabel={submenu(t('localNav.groups.usersSystem'))}
              >
                <GcdsNavLink href={getPath('users', lang)}>{t('localNav.items.manageUsers')}</GcdsNavLink>
                <GcdsNavLink href={getPath('sessions', lang)}>{t('localNav.items.activeSessions')}</GcdsNavLink>
                <GcdsNavLink href={getPath('settings', lang)}>{t('localNav.items.settings')}</GcdsNavLink>
              </GcdsNavGroup>

              <GcdsNavGroup
                openTrigger={t('localNav.groups.infrastructure')}
                menuLabel={submenu(t('localNav.groups.infrastructure'))}
              >
                <GcdsNavLink href={getPath('database', lang)}>{t('localNav.items.manageDatabase')}</GcdsNavLink>
                <GcdsNavLink href={getPath('vector', lang)}>{t('localNav.items.vectorAdmin')}</GcdsNavLink>
                <GcdsNavLink href={getPath('eval', lang)}>{t('localNav.items.evalAdmin')}</GcdsNavLink>
                <GcdsNavLink href={getPath('connectivity', lang)}>{t('localNav.items.connectivity')}</GcdsNavLink>
              </GcdsNavGroup>
            </>
          )}
        </GcdsTopNav>
      </div>

      {/* Mobile: our overlay design with desktop-matching group structure */}
      <div className="nav-variant-mobile-bar">
        <NavVariantMobile variant={variant} lang={lang} generic={generic} />
      </div>
    </>
  );
}
