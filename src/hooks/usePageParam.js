import { useSearchParams } from 'react-router-dom';

// Simplified mappings for most common departments
export const DEPARTMENT_MAPPINGS = {
  'revenue-agency': {
    code: 'CRA',
    fr: 'agence-revenu',
    en: 'revenue-agency',
    domains: ['canada.ca'],
  },
  'immigration-refugees-citizenship': {
    code: 'IRCC',
    fr: 'immigration-refugies-citoyennete',
    en: 'immigration-refugees-citizenship',
    domains: ['canada.ca', 'ircc.canada.ca'],
  },
  'employment-social-development': {
    code: 'ESDC',
    fr: 'emploi-developpement-social',
    en: 'employment-social-development',
    domains: ['canada.ca'],
  },
  'indigenous-services': {
    code: 'ISC',
    fr: 'services-autochtones',
    en: 'indigenous-services',
    domains: ['canada.ca', 'sac-isc.gc.ca'],
  },
  'public-services-procurement': {
    code: 'PSPC',
    fr: 'services-publics-approvisionnement',
    en: 'public-services-procurement',
    domains: ['canada.ca'],
  },
  'treasury-board-secretariat': {
    code: 'PSPC',
    fr: 'secretariat-conseil-tresor',
    en: 'treasury-board-secretariat',
    domains: ['canada.ca', 'tbs-sct.canada.ca'],
  },
};

const THEME_MAPPINGS = {
  taxes: {
    fr: 'impots',
    en: 'taxes',
    department: 'CRA',
  },
  benefits: {
    fr: 'prestations',
    en: 'benefits',
    department: 'ESDC',
  },
  publicservice: {
    fr: 'fonctionpublique',
    en: 'publicservice',
    department: 'PSPC',
  },
  // Add more theme mappings as needed
};

/**
 * Get the Azure referral_uri from the window config (if available)
 * This is injected by the Express server from Azure cloud context
 * @returns {string} The referral_uri from Azure, or empty string if not available
 */
export function getAzureReferralUri() {
  try {
    return (window?.RUNTIME_CONFIG?.AZURE_REFERRAL_URI || '').trim();
  } catch (e) {
    return '';
  }
}

export function usePageContext() {
  const [searchParams] = useSearchParams();

  const rawRef = searchParams.get('ref') || '';
  // console.log('usePageContext - raw ref:', rawRef);

  try {
    // TODO: Handle malformed URLs where some slashes are not properly encoded as %2F
    // Current implementation only works with properly encoded URLs
    // Example of malformed: https%3A%2F%2Fwww.canada.ca%2Fen/immigration-refugees-citizenship%2Fservices/canadian-passports.html

    const fixedRef = rawRef.replace(/\//g, '%2F');
    // console.log('usePageContext - fixed ref:', fixedRef);

    const decodedRef = decodeURIComponent(fixedRef);
    // console.log('usePageContext - decoded:', decodedRef);

    const urlObj = new URL(decodedRef);

    // Determine language for ISC domain
    const isISC = urlObj.hostname.includes('sac-isc.gc.ca');
    const language = isISC
      ? urlObj.pathname.includes('/fra/')
        ? 'fr'
        : 'en'
      : urlObj.pathname.includes('/fr/')
        ? 'fr'
        : 'en';

    // Parse department from URL
    let department = '';
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);

    // First check specific domains
    if (urlObj.hostname === 'ircc.canada.ca') {
      department = 'IRCC';
    } else if (urlObj.hostname === 'sac-isc.gc.ca' || urlObj.hostname.includes('sac-isc.gc.ca')) {
      department = 'ISC';
    }

    // If no domain match, check for theme-based matches
    if (!department) {
      for (let i = 0; i < pathSegments.length - 1; i++) {
        if (pathSegments[i] === 'services') {
          const nextSegment = pathSegments[i + 1];
          for (const [, theme] of Object.entries(THEME_MAPPINGS)) {
            if (nextSegment === theme.en || nextSegment === theme.fr) {
              department = theme.department;
              break;
            }
          }
        }
        if (department) break;
      }
    }

    // If still no match, check for department matches in path
    if (!department) {
      for (const segment of pathSegments) {
        for (const [, value] of Object.entries(DEPARTMENT_MAPPINGS)) {
          if (segment === value.en || segment === value.fr) {
            department = value.code;
            break;
          }
        }
        if (department) break;
      }
    }

    return {
      referrer: rawRef,
      url: decodedRef,
      language,
      department,
    };
  } catch {
    return {
      referrer: '',
      url: '',
      language: 'en',
      department: '',
    };
  }
}
