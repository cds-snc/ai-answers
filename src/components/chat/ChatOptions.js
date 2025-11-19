import React from 'react';
import { GcdsDetails } from '@cdssnc/gcds-components-react';
import { RoleBasedContent } from '../RoleBasedUI.js';

const ChatOptions = ({ 
  safeT,
  selectedAI,
  handleAIToggle,
  selectedSearch,
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
          <div className="ai-toggle">
            <fieldset className="ai-toggle_fieldset">
              <div className="ai-toggle_container">
                <legend className="ai-toggle_legend">
                  {safeT('homepage.chat.options.aiSelection.label')}
                </legend>
                <div className="ai-toggle_option">
                  <input
                    type="radio"
                    id="anthropic"
                    name="ai-selection"
                    value="anthropic"
                    checked={selectedAI === 'anthropic'}
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
                    checked={selectedAI === 'openai'}
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
                    checked={selectedAI === 'azure'}
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
                <option value="Default">Default</option>
                <option value="DefaultAlwaysContext">DefaultAlwaysContext</option>
                <option value="DefaultWithVector">DefaultWithVector</option>
                <option value="DefaultWithVectorGraph">DefaultWithVectorGraph</option>
              </select>
            </div>
          </div>

          <div className="search-toggle">
            <fieldset className="ai-toggle_fieldset">
              <div className="ai-toggle_container">
                <legend className="ai-toggle_legend">
                  {safeT('homepage.chat.options.searchSelection.label')}
                </legend>
                <div className="ai-toggle_option">
                  <input
                    type="radio"
                    id="search-canadaca"
                    name="search-selection"
                    value="canadaca"
                    checked={selectedSearch === 'canadaca'}
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
                    checked={selectedSearch === 'google'}
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

