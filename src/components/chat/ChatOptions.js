import React from 'react';
import { GcdsDetails } from '@cdssnc/gcds-components-react';
import { RoleBasedContent } from '../RoleBasedUI.js';
import { WORKFLOWS, AVAILABLE_MODELS } from '../../config/workflows.js';

const ChatOptions = ({
  safeT,
  selectedAI,
  handleAIToggle,
  // selectedSearch,
  handleSearchToggle,
  workflow,
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
                value={workflow}
                onChange={handleWorkflowChange}
                className="chat-border"
              >
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
                value={selectedAI || ''}
                onChange={handleAIToggle}
                className="chat-border"
              >
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

