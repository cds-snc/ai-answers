import React from 'react';
import { GcdsLink } from '@gcds-core/components-react';
import { getPath } from '../../utils/routes.js';

// Shared, plain/unwrapped content — the editor page
// (src/pages/ScenarioOverridesPage.js) renders this as-is; the chat page
// (src/components/chat/ChatInterface.js) wraps it in its own purple
// "testing local scenario" box alongside the banner text. Collapsed by
// default; a real <ol> (not "1)"/"2)" as plain text) so a screen reader
// announces it as an actual list.
//
// `lang`/`departmentKey` are optional together: pass both to also render a
// "return to edit scenario" link (the chat page's case — you're not
// currently on the editor, so a way back is useful); omit both on the
// editor page itself, where that link wouldn't make sense since you're
// already there.
const ScenarioSubmitInstructions = ({ t, lang, departmentKey }) => (
  <>
    <details className="mb-100">
      <summary style={{ cursor: 'pointer' }}>{t('scenarioOverrides.submit.heading')}</summary>
      <p className="mt-100">{t('scenarioOverrides.submit.intro')}</p>
      {/* list-decimal: GC DS resets ol/ul to list-style:none globally
          (gcds-utility.min.css) — this is its own utility class for
          restoring visible numbering, rather than a custom override.
          canada-ca-list-spcd-2: this codebase's own item-spacing class,
          already paired with list-disc the same way in BatchUpload.js and
          ExpertFeedbackComponent.js — same double-class convention. */}
      <ol className="list-decimal canada-ca-list-spcd-2">
        <li>{t('scenarioOverrides.submit.step1')}</li>
        <li>{t('scenarioOverrides.submit.step2')}</li>
      </ol>
    </details>
    {lang && departmentKey && (
      <p className="mt-200 mb-100">
        <GcdsLink href={`${getPath('scenario-overrides', lang)}?department=${encodeURIComponent(departmentKey)}#scenario-department-heading`}>
          {t('homepage.chat.scenarioOverride.manageLink')}
        </GcdsLink>
        {/* Period stays outside the link — punctuation, not part of its
            accessible name. */}
        .
      </p>
    )}
  </>
);

export default ScenarioSubmitInstructions;
