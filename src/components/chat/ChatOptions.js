import React from 'react';
import { GcdsDetails } from '@cdssnc/gcds-components-react';
import { RoleBasedContent } from '../RoleBasedUI.js';

const ChatOptions = ({
  safeT,
  // selectedAI,
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
          {/* Provider selection is hidden for now; Azure is forced as provider
              We keep radio inputs in the DOM (visually hidden) so the selection
              can be re-enabled easily in the future. */}
          <div className="ai-toggle" aria-hidden="true">
            <fieldset className="ai-toggle_fieldset">
              {/* visually hide the options but keep them in DOM for future re-enable */}
              <div className="ai-toggle_container" style={{ display: 'none' }}>
                <legend className="ai-toggle_legend">
                  {safeT('homepage.chat.options.aiSelection.label')}
                </legend>
                <div className="ai-toggle_option">
                  <input
                    type="radio"
                    id="anthropic"
                    name="ai-selection"
                    value="anthropic"
                    checked={false}
                    onChange={handleAIToggle}
                    className="ai-toggle_radio-input"
                  />
                  <label htmlFor="anthropic">
                    {safeT('homepage.chat.options.aiSelection.anthropic')}
                  </label>
                </div>
                <div className="ai-toggle_option">
                  <input
                    type="radio"
                    id="openai"
                    name="ai-selection"
                    value="openai"
                    checked={false}
                    onChange={handleAIToggle}
                    className="ai-toggle_radio-input"
                  />
                  <label htmlFor="openai">{safeT('homepage.chat.options.aiSelection.openai')}</label>
                </div>
                <div className="ai-toggle_option">
                  <input
                    type="radio"
                    id="azure"
                    name="ai-selection"
                    value="azure"
                    checked={true}
                    onChange={handleAIToggle}
                    className="ai-toggle_radio-input"
                  />
                  <label htmlFor="azure">{safeT('homepage.chat.options.aiSelection.azure')}</label>
                </div>
              </div>
            </fieldset>
          </div>

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
                <option value="DefaultGraph">DefaultGraph</option>
                <option value="DefaultWithVectorGraph">DefaultWithVectorGraph</option>
                <option value="InstantAndQAGraph">InstantAndQAGraph</option>
                <option value="GPT5MiniDefaultGraph">GPT5MiniDefaultGraph</option>
                <option value="GPT5OneDefaultGraph">GPT5OneDefaultGraph</option>
                <option value="GPT5OneChatGraph">GPT5OneChatGraph</option>
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

