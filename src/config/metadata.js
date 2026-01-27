/**
 * Metadata Constants
 * 
 * Centralized configuration for metadata values used across the application.
 * These values should match the meta tags in public/index.html.
 * 
 * NOTE: Changes to these values should also be reflected in public/index.html
 * for initial page load metadata.
 */

/**
 * Dublin Core Terms (dcterms) metadata
 */
export const DCTERMS = {
  /**
   * Service identifier for Adobe Analytics and government tracking
   * Format: ESDC-EDCS_AIAnswers-ReponsesIA
   */
  SERVICE: 'ESDC-EDCS_AIAnswers-ReponsesIA',
  
  /**
   * Creator/Author information
   */
  CREATOR: {
    EN: 'Employment and Social Development Canada',
    FR: 'Emploi et Développement social Canada'
  }
};

/**
 * Default metadata values for pages
 */
export const DEFAULT_METADATA = {
  TITLE: {
    EN: 'AI Answers',
    FR: 'Réponses IA'
  },
  DESCRIPTION: {
    EN: 'AI Answers is a specialized AI chat agent designed for users of Canada.ca and all Government of Canada websites.',
    FR: 'Réponses IA est un agent de discussion IA spécialisé conçu pour les utilisateurs de Canada.ca et de tous les sites Web du gouvernement du Canada.'
  }
};

export default {
  DCTERMS,
  DEFAULT_METADATA
};
