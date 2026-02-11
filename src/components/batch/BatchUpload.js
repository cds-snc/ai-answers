// src/components/batch/BatchUpload.js
import React, { useState, useEffect } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { GcdsContainer, GcdsText } from '@cdssnc/gcds-components-react';
import BatchService from '../../services/BatchService.js';
import '../../styles/App.css';
import * as XLSX from 'xlsx';

const BatchUpload = ({ lang, onBatchSaved }) => {
  const { t } = useTranslations(lang);
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  // Removed unused results state
  const [error, setError] = useState(null);
  const [selectedAI, setSelectedAI] = useState('azure');
  const [fileUploaded, setFileUploaded] = useState(false);
  const [batchId, setBatchId] = useState(null);
  const [batchStatus, setBatchStatus] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [batchName, setBatchName] = useState('');
  const [selectedSearch, setSelectedSearch] = useState('google');
  const [selectedWorkflow, setSelectedWorkflow] = useState('DefaultGraph');

  const handleFileChange = (event) => {
    setError(null);
    const uploadedFile = event.target.files[0];

    if (!uploadedFile) {
      setFile(null);
      return;
    }

    if (!uploadedFile.name.endsWith('.csv')) {
      setError(t('batch.upload.error.invalidFile'));
      setFile(null);
      return;
    }

    setFile(uploadedFile);
    setFileUploaded(false);
  };

  const handleAIToggle = (e) => {
    setSelectedAI(e.target.value);
  };

  const handleSearchToggle = (e) => {
    setSelectedSearch(e.target.value);
  };

  const handleWorkflowChange = (e) => {
    setSelectedWorkflow(e.target.value);
  };

  const handleLanguageToggle = (e) => {
    setSelectedLanguage(e.target.value);
  };

  const handleBatchNameChange = (e) => {
    setBatchName(e.target.value);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!processing) {
      if (!file) {
        setError('Please select a file first');
        return;
      }

      if (!batchName.trim()) {
        setError(t('batch.upload.error.nameRequired') || 'Please enter a batch name');
        return;
      }

      try {
        // Hide the upload button immediately to prevent duplicate submissions
        // and give the user immediate feedback that the upload started.
        setFileUploaded(true);
        // Indicate processing state so the UI can show a brief message while we
        // parse the CSV and wait for the server to persist the batch.
        setProcessing(true);

        const text = await file.text();
        // Parse CSV to entries and prepare items for server-side BatchItem creation
        const entries = processCSV(text);

        // Only keep fields needed: question variants and URLs
        const questionKeys = ['REDACTEDQUESTION', 'QUESTION', 'PROBLEMDETAILS', 'REDACTED QUESTION'];
        const items = entries.map((e, idx) => {
          const original = {};
          questionKeys.forEach((key) => {
            if (e[key]) original[key] = e[key];
          });
          if (e.URL) original.URL = e.URL;
          if (e.REFERRINGURL) original.REFERRINGURL = e.REFERRINGURL;
          return { rowIndex: idx, originalData: original };
        });

        // Persist an initial batch record so it shows up in the processing list (server will create BatchItems)
        const payload = {
          name: batchName || `client-batch-${Date.now()}`,
          aiProvider: selectedAI,
          pageLanguage: selectedLanguage,
          searchProvider: selectedSearch,
          workflow: selectedWorkflow,
          type: 'client',
          status: 'uploaded',
          items,
        };

        try {
          const persisted = await BatchService.persistBatch(payload);
          const id = persisted?.batchId || persisted?._id || persisted?.id || null;
          setBatchId(id);
          setBatchStatus('uploaded');
          // no-op: removed unused results state
          setError(null);
          // Notify parent to refresh lists immediately
          try {
            if (typeof onBatchSaved === 'function') onBatchSaved();
          } catch (cbErr) {
            // ignore callback errors
          }
          // Reset the upload form so the user can upload another file
          setFile(null);
          setBatchName('');
          // finished processing, clear processing flag and allow another upload
          setFileUploaded(false);
          setProcessing(false);
          // Clear the file input DOM value (best-effort)
          try {
            const input = document.getElementById('csvFile');
            if (input) input.value = '';
          } catch (domErr) {
            // ignore DOM reset errors
          }
          // Re-show the upload button so the user can upload another file
          setFileUploaded(false);
        } catch (persistErr) {
          console.error('Failed to persist batch:', persistErr);
          setError(persistErr?.message || 'Failed to save batch to server');
          // Re-show the upload button so the user can retry
          setFileUploaded(false);
          setProcessing(false);
        }
      } catch (err) {
        setError('Failed to read the file. Please try uploading again.');
        console.error('Error reading file:', err);
        setProcessing(false);
      }
    }
  };

  const processCSV = (csvText) => {
    try {
      // Parse the CSV content using XLSX
      const workbook = XLSX.read(csvText, { type: 'string' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Convert sheet data to JSON
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

      // Validate and extract data
      if (!jsonData.length) {
        throw new Error('The CSV file is empty or invalid.');
      }

      const headers = jsonData[0].map((header) => header.trim().toUpperCase());
      const problemDetailsIndex = headers.findIndex(
        (h) => h === 'PROBLEM DETAILS' || h === 'QUESTION' || h === 'REDACTEDQUESTION'
      );

      if (problemDetailsIndex === -1) {
        throw new Error(
          'Required column "PROBLEM DETAILS/REDACTEDQUESTION" not found in CSV file. Please ensure you are using a file with that column or downloaded from the Feedback Viewer.'
        );
      }

      const entries = jsonData
        .slice(1)
        .map((row) => {
          const entry = {};
          headers.forEach((header, index) => {
            const key = header === 'PROBLEM DETAILS' ? 'REDACTEDQUESTION' : header;
            entry[key] = row[index]?.trim() || '';
          });
          console.log('Processing entry:', entry);
          return entry;
        })
        .filter((entry) => entry['REDACTEDQUESTION']); // Only filter based on 'QUESTION' presence

      console.log(`Found ${entries.length} valid entries to process`);
      return entries;
    } catch (error) {
      console.error('Error processing CSV:', error);
      throw new Error(`Failed to process CSV file: ${error.message}`);
    }
  };






  useEffect(() => {
    console.log('State changed:', {
      processing,
      batchStatus,
      batchId,
    });
  }, [processing, batchStatus, batchId]);

  return (
    <GcdsContainer className="mb-600">
      <div className="steps-container">
        <div className="step">
          <GcdsText>{t('batch.upload.intro')}</GcdsText>
          <GcdsText>{t('batch.upload.csvRequirements.title')}</GcdsText>
          <ul>
            <li>{t('batch.upload.csvRequirements.items.problemDetails')}</li>
            <li>{t('batch.upload.csvRequirements.items.url')}</li>
          </ul>

          <form onSubmit={handleUpload} className="mt-400">
            <div className="mrgn-bttm-20">
              <label htmlFor="batchName" className="mrgn-bttm-10 display-block">
                {t('batch.upload.batchName')}
              </label>
              <input
                type="text"
                id="batchName"
                value={batchName}
                onChange={handleBatchNameChange}
                className="mrgn-bttm-10"
                required
                aria-required="true"
              />
            </div>

            <div className="ai-toggle">
              <fieldset className="ai-toggle_fieldset">
                <div className="ai-toggle_container">
                  <legend className="ai-toggle_legend">{t('batch.upload.aiService.label')}</legend>

                  <div className="flex-center">
                    <input
                      type="radio"
                      id="chatgpt"
                      name="ai-selection"
                      value="openai"
                      checked={selectedAI === 'openai'}
                      onChange={handleAIToggle}
                      className="ai-toggle_radio-input"
                    />
                    <label className="mrgn-rght-15" htmlFor="chatgpt">
                      {t('batch.upload.aiService.openai')}
                    </label>
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
                    <label htmlFor="azure">{t('batch.upload.aiService.azure')}</label>
                  </div>
                  <div className="ai-toggle_option">
                    <input
                      type="radio"
                      id="azure-gpt51"
                      name="ai-selection"
                      value="openai-gpt51"
                      checked={selectedAI === 'openai-gpt51'}
                      onChange={handleAIToggle}
                      className="ai-toggle_radio-input"
                    />
                    <label htmlFor="azure-gpt51">{t('batch.upload.aiService.azure-gpt51')}</label>
                  </div>
                  <div className="ai-toggle_option">
                    <input
                      type="radio"
                      id="azure-gpt51-chat"
                      name="ai-selection"
                      value="openai-gpt51-chat"
                      checked={selectedAI === 'openai-gpt51-chat'}
                      onChange={handleAIToggle}
                      className="ai-toggle_radio-input"
                    />
                    <label htmlFor="azure-gpt51-chat">{t('batch.upload.aiService.azure-gpt51-chat')}</label>
                  </div>
                </div>
              </fieldset>
            </div>

            <div className="search-toggle">
              <fieldset className="ai-toggle_fieldset">
                <div className="ai-toggle_container">
                  <legend className="ai-toggle_legend">
                    {t('batch.upload.searchService.label')}
                  </legend>

                  <div className="flex-center">
                    <input
                      type="radio"
                      id="google"
                      name="search-selection"
                      value="google"
                      checked={selectedSearch === 'google'}
                      onChange={handleSearchToggle}
                      className="ai-toggle_radio-input"
                    />
                    <label className="mrgn-rght-15" htmlFor="google">
                      {t('batch.upload.searchService.google')}
                    </label>
                  </div>
                  <div className="ai-toggle_option">
                    <input
                      type="radio"
                      id="canadaca"
                      name="search-selection"
                      value="canadaca"
                      checked={selectedSearch === 'canadaca'}
                      onChange={handleSearchToggle}
                      className="ai-toggle_radio-input"
                    />
                    <label htmlFor="canadaca">{t('batch.upload.searchService.canadaca')}</label>
                  </div>
                </div>
              </fieldset>
            </div>

            <div className="workflow-select mrgn-bttm-20">
              <div className="mrgn-bttm-10">
                <label htmlFor="workflow" className="mrgn-bttm-10 display-block">
                  {t('batch.upload.workflow.label') || 'Workflow'}
                </label>
                <select
                  id="workflow"
                  name="workflow"
                  value={selectedWorkflow}
                  onChange={handleWorkflowChange}
                  className="chat-border"
                  style={{ width: 'auto', display: 'inline-block' }}
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

            <div className="language-toggle mrgn-bttm-20">
              <fieldset className="ai-toggle_fieldset">
                <div className="flex-center">
                  <legend className="ai-toggle_legend">{t('batch.upload.language.label')}</legend>
                  <div className="flex-center mrgn-rght-15">
                    <input
                      type="radio"
                      id="english"
                      name="language-selection"
                      value="en"
                      checked={selectedLanguage === 'en'}
                      onChange={handleLanguageToggle}
                      className="ai-toggle_radio-input"
                    />
                    <label className="mrgn-rght-15" htmlFor="english">
                      {t('batch.upload.language.english')}
                    </label>
                  </div>
                  <div className="flex-center">
                    <input
                      type="radio"
                      id="french"
                      name="language-selection"
                      value="fr"
                      checked={selectedLanguage === 'fr'}
                      onChange={handleLanguageToggle}
                      className="ai-toggle_radio-input"
                    />
                    <label htmlFor="french">{t('batch.upload.language.french')}</label>
                  </div>
                </div>
              </fieldset>
            </div>

            <div className="file-input-container mrgn-bttm-20">
              <label htmlFor="csvFile" className="mrgn-bttm-10 display-block">
                {t('batch.upload.file.label')}
              </label>
              <input
                type="file"
                id="csvFile"
                accept=".csv"
                onChange={handleFileChange}
                className="mrgn-bttm-10 display-block"
              />
              {file && (
                <div>
                  {t('batch.upload.file.selected')} {file.name}
                </div>
              )}
            </div>

            {error && <div className="error-message mrgn-bttm-10 red">{error}</div>}

            {processing && (
              <div className="processing-message mrgn-bttm-10">
                {t('batch.upload.processing') || 'Processing file, please wait...'}
              </div>
            )}

            {file && !fileUploaded && (
              <button type="submit" className="primary-button force-style-button">
                {t('batch.upload.buttons.upload')}
              </button>
            )}



          </form>
        </div>
      </div>
    </GcdsContainer>
  );
};

export default BatchUpload;
