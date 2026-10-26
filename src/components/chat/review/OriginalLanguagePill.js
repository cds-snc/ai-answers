import React from 'react';
import { getOriginallyAskedInLabel } from '../../../utils/answerLanguage.js';

// Shown next to admin/eval content that's displaying the English-translated
// version because the original wasn't EN or FR (see resolveDisplayContent in
// answerLanguage.js) — a quiet, informational flag, not a link or expandable
// detail. The original-language text stays out of the admin UI entirely once
// it isn't EN/FR; this pill is the only trace of it here. Full fidelity
// (redactedQuestion, questionLanguage) still lives in the download logs
// (chat-export-logs.js), untouched by this display rule.
//
// Detail views only (e.g. ExpertFeedbackPanel.js) — dense grids like
// ChatDashboardPage.js's table deliberately skip this: an admin scanning
// many rows can open the chat itself for that detail, and a pill in every
// row of a Question/Answer column pair would be clutter, not signal.
//
// .filter-pill/.filter-pill--info (admin.css) — the existing non-interactive
// "informational" pill style already used elsewhere in the admin UI, reused
// here rather than a new pattern.
const OriginalLanguagePill = ({ languageCode, lang = 'en', t }) => {
  const label = getOriginallyAskedInLabel({ languageCode, lang, t });
  if (!label) return null;

  return (
    <span className="pill-group">
      <span className="filter-pill filter-pill--info">
        {label}
      </span>
      {/* French UI only: an EN-UI admin seeing English content is
          unremarkable, but a FR-UI admin might otherwise expect the French
          they're reading everywhere else on the page - this pill exists so
          they don't assume a French version is available (there never is
          one for a non-EN/FR question; see official-languages.md Rule 1). */}
      {lang === 'fr' && (
        <span className="filter-pill filter-pill--info">
          {t('admin.common.aiAnswersSource')}
        </span>
      )}
    </span>
  );
};

export default OriginalLanguagePill;
