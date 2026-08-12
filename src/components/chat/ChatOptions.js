import React from 'react';
import { GcdsDetails } from '@gcds-core/components-react';
import { RoleBasedContent } from '../RoleBasedUI.js';
import { WORKFLOWS, AVAILABLE_MODELS, WORKFLOW_VALUES, MODEL_VALUES } from '../../config/workflows.js';

// workflowSelection / modelSelection are what the dropdowns show, which is not
// the same thing as what the chat will run: '' means "no override, follow the
// system settings", and the effective value in that case lives in
// ChatAppContainer (and is resolved server-side regardless).
const ChatOptions = ({
  safeT,
  modelSelection,
  handleAIToggle,
  // selectedSearch,
  handleSearchToggle,
  workflowSelection,
  handleWorkflowChange,
  referringUrl,
  handleReferringUrlChange
}) => {
  return (
    // Make the entire details panel visible to admin and partner; inside, restrict some controls to admin only
    <RoleBasedContent roles={["admin", "partner"]}>
      <GcdsDetails className="hr" detailsTitle={safeT('homepage.chat.options.title')} tabIndex="0">
        {/* Admin-only controls */}
        <RoleBasedContent roles={['admin']}>
          <div className="workflow-select">
            <div className="mrgn-bttm-10">
              <label htmlFor="workflow">{safeT('homepage.chat.options.workflow.label')}</label>
              <select
                id="workflow"
                name="workflow"
                // Render blank rather than silently falling back to the first
                // option while the configured default is still loading — an
                // unmatched value here would misreport which workflow ran.
                value={WORKFLOW_VALUES.includes(workflowSelection) ? workflowSelection : ''}
                onChange={handleWorkflowChange}
                className="chat-border"
              >
                <option value="">{safeT('homepage.chat.options.useSystemSettings')}</option>
                {WORKFLOWS.map(w => (
                  <option key={w.value} value={w.value}>{safeT(w.labelKey)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="workflow-select">
            <div className="mrgn-bttm-10">
              <label htmlFor="model">{safeT('homepage.chat.options.model.label')}</label>
              <select
                id="model"
                name="model"
                value={MODEL_VALUES.includes(modelSelection) ? modelSelection : ''}
                onChange={handleAIToggle}
                className="chat-border"
              >
                <option value="">{safeT('homepage.chat.options.useSystemSettings')}</option>
                {AVAILABLE_MODELS.map(m => (
                  <option key={m.value} value={m.value}>{safeT(m.labelKey)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Search selection is hidden for now; Google is forced as the search provider
              We keep the radio inputs in the DOM (visually hidden) so this can be
              re-enabled easily in the future. */}
          <div className="search-toggle" aria-hidden="true">
            <fieldset className="ai-toggle_fieldset">
              {/* visually hide the options but keep them in DOM for future re-enable */}
              <div className="ai-toggle_container" style={{ display: 'none' }}>
                <legend className="ai-toggle_legend">
                  {safeT('homepage.chat.options.searchSelection.label')}
                </legend>
                <div className="ai-toggle_option">
                  <input
                    type="radio"
                    id="search-canadaca"
                    name="search-selection"
                    value="canadaca"
                    checked={false}
                    onChange={handleSearchToggle}
                    className="ai-toggle_radio-input"
                  />
                  <label htmlFor="search-canadaca">
                    {safeT('homepage.chat.options.searchSelection.canadaca')}
                  </label>
                </div>
                <div className="ai-toggle_option">
                  <input
                    type="radio"
                    id="search-google"
                    name="search-selection"
                    value="google"
                    checked={true}
                    onChange={handleSearchToggle}
                    className="ai-toggle_radio-input"
                  />
                  <label htmlFor="search-google">
                    {safeT('homepage.chat.options.searchSelection.google')}
                  </label>
                </div>
              </div>
            </fieldset>
          </div>
        </RoleBasedContent>

        {/* Referring URL visible to both admin and partner */}
        <div className="mrgn-bttm-10">
          <label htmlFor="referring-url">{safeT('homepage.chat.options.referringUrl.label')}</label>
          <input
            id="referring-url"
            type="url"
            value={referringUrl}
            onChange={handleReferringUrlChange}
            className="chat-border"
          />
        </div>
      </GcdsDetails>
    </RoleBasedContent>
  );
};

export default ChatOptions;

