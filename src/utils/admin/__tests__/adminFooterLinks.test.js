import { describe, it, expect } from 'vitest';
import en from '../../../locales/en.json';
import fr from '../../../locales/fr.json';
import { getAdminFooterLinks } from '../adminFooterLinks.js';

const translator = (locale) => (key) => key.split('.').reduce((o, k) => o?.[k], locale);

describe('getAdminFooterLinks', () => {
  it('builds the five English links, with Contact CEO as a team mailto', () => {
    expect(getAdminFooterLinks('en', translator(en))).toEqual({
      'About AI Answers': '/en/about',
      'How to guides': '/en/admin#how-to-guides',
      'Contact CEO': 'mailto:RIA-AIA@servicecanada.gc.ca',
      'Terms and conditions': 'https://www.canada.ca/en/transparency/terms.html',
      'Privacy': 'https://www.canada.ca/en/transparency/privacy.html',
    });
  });

  it('builds the French links with French labels and URLs', () => {
    const links = getAdminFooterLinks('fr', translator(fr));
    expect(Object.values(links)).toEqual([
      '/fr/a-propos',
      '/fr/admin#how-to-guides',
      'mailto:RIA-AIA@servicecanada.gc.ca',
      'https://www.canada.ca/fr/transparence/avis.html',
      'https://www.canada.ca/fr/transparence/confidentialite.html',
    ]);
    expect(Object.keys(links)).not.toContain('undefined');
    expect(Object.keys(links)).toHaveLength(5);
  });
});
