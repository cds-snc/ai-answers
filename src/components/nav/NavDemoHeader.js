import React, { useState, useRef, useEffect } from 'react';
import { GcdsLangToggle, GcdsBreadcrumbs } from '@gcds-core/components-react';
import { AccountMenu } from './NavVariantPreview.js';
import NavVariantPreview from './NavVariantPreview.js';

const SKIP_I18N = {
  en: { skip: 'Skip to main content', label: 'Skip to' },
  fr: { skip: 'Passer au contenu principal', label: 'Passer au' },
};

export default function NavDemoHeader({ lang, langHref, variant, demoEmail, showSearch = false }) {
  const i18n = SKIP_I18N[lang] ?? SKIP_I18N.en;
  const sigSrc = lang === 'fr' ? '/sig-clr-fr.svg' : '/sig-clr-en.svg';
  const sigAlt = lang === 'fr' ? 'Gouvernement du Canada' : 'Government of Canada';
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  return (
    <header role="banner" className="nav-demo-custom-header">
      <nav className="nav-demo-skip-nav" aria-label={i18n.label}>
        <a href="#main-content" className="nav-demo-skip-link">{i18n.skip}</a>
      </nav>

      <div className={`nav-demo-brand${searchOpen ? ' nav-demo-brand--search-open' : ''}`}>
        <div className="nav-demo-brand__inner">
          <div className="nav-demo-brand__sig">
            <img src={sigSrc} alt={sigAlt} className="nav-demo-sig-img" />
          </div>
          <div className="nav-demo-brand__toggle">
            <GcdsLangToggle lang={lang} href={langHref} />
          </div>
          <div className={`nav-demo-brand__account${showSearch ? ' nav-demo-brand__account--with-search' : ''}`}>
            {showSearch && (
              <button
                className={`nav-demo-search-toggle${searchOpen ? ' nav-demo-search-toggle--active' : ''}`}
                type="button"
                aria-expanded={searchOpen}
                aria-label={lang === 'fr' ? 'Rechercher dans Canada.ca' : 'Search Canada.ca'}
                onClick={() => setSearchOpen(o => !o)}
              >
                <i className={`fa-solid ${searchOpen ? 'fa-xmark' : 'fa-magnifying-glass'}`} aria-hidden="true" />
              </button>
            )}
            {showSearch ? (
              <button className="nav-demo-signin-btn" type="button">
                {lang === 'fr' ? 'Se connecter' : 'Sign in'}
              </button>
            ) : (
              <AccountMenu lang={lang} overrideEmail={demoEmail} compact />
            )}
          </div>
        </div>
      </div>

      {showSearch && searchOpen && (
        <div className="nav-demo-search-expanded">
          <div className="nav-demo-search-container">
            <form role="search" onSubmit={e => e.preventDefault()}>
              <label className="wb-invis" htmlFor="nav-demo-search-input">
                {lang === 'fr' ? 'Rechercher dans Canada.ca' : 'Search Canada.ca'}
              </label>
              <div className="nav-demo-search-input-wrap">
                <input
                  ref={searchInputRef}
                  id="nav-demo-search-input"
                  className="nav-demo-search-input"
                  type="search"
                  placeholder={lang === 'fr' ? 'Rechercher dans Canada.ca' : 'Search Canada.ca'}
                />
                <button className="nav-demo-search-submit" type="submit" aria-label={lang === 'fr' ? 'Lancer la recherche' : 'Search'}>
                  <i className="fa-solid fa-magnifying-glass nav-demo-search-submit-icon" aria-hidden="true" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <NavVariantPreview variant={variant} lang={lang} generic={showSearch} />

      <div className="nav-demo-breadcrumb-container">
        <GcdsBreadcrumbs lang={lang} />
      </div>
    </header>
  );
}
