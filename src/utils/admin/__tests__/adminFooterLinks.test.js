import { describe, it, expect } from 'vitest';
import en from '../../../locales/en.json';
import fr from '../../../locales/fr.json';
import { getAdminFooterProps } from '../adminFooterLinks.js';

const translator = (locale) => (key) => key.split('.').reduce((o, k) => o?.[k], locale);

describe('getAdminFooterProps', () => {
  it('puts the team links in the contextual band and Canada.ca links in the sub band (English)', () => {
    const props = getAdminFooterProps('en', translator(en));
    expect(Object.keys(props.contextualLinks)).toEqual(['Contact AI Answers', 'About AI Answers', 'How to guides']);
    expect(props).toEqual({
      contextualHeading: 'Admin and partner resources',
      contextualLinks: {
        'Contact AI Answers': 'mailto:RIA-AIA@servicecanada.gc.ca',
        'About AI Answers': '/en/about',
        'How to guides': '/en/admin#how-to-guides',
      },
      subLinks: {
        'Terms and conditions': 'https://www.canada.ca/en/transparency/terms.html',
        'Privacy': 'https://www.canada.ca/en/transparency/privacy.html',
      },
    });
  });

  it('builds the French heading, labels and URLs', () => {
    const props = getAdminFooterProps('fr', translator(fr));
    expect(props.contextualHeading).toBe('Ressources pour les administrateurs et les partenaires');
    expect(Object.values(props.contextualLinks)).toEqual([
      'mailto:RIA-AIA@servicecanada.gc.ca',
      '/fr/a-propos',
      '/fr/admin#how-to-guides',
    ]);
    expect(Object.values(props.subLinks)).toEqual([
      'https://www.canada.ca/fr/transparence/avis.html',
      'https://www.canada.ca/fr/transparence/confidentialite.html',
    ]);
    const labels = [...Object.keys(props.contextualLinks), ...Object.keys(props.subLinks)];
    expect(labels).not.toContain('undefined');
    expect(labels).toHaveLength(5);
  });

  it('stays within GcdsFooter limits (3 contextual links, 5 sub links)', () => {
    const props = getAdminFooterProps('en', translator(en));
    expect(Object.keys(props.contextualLinks).length).toBeLessThanOrEqual(3);
    expect(Object.keys(props.subLinks).length).toBeLessThanOrEqual(5);
  });
});
