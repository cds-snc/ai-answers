// src/components/batch/BatchUpload.js
import React, { useState, useEffect, useRef } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { GcdsContainer, GcdsFileUploader, GcdsFieldset, GcdsStepper, GcdsInput, GcdsSelect } from '@gcds-core/components-react';
import BatchService from '../../services/BatchService.js';
import DataStoreService from '../../services/DataStoreService.js';
import { WORKFLOWS, AVAILABLE_MODELS } from '../../config/workflows.js';
import { parseBatchCsv } from '../../utils/spreadsheets/csv.js';
import { MAX_BATCH_ITEMS } from '../../config/batch.js';
import { useAnnouncedError } from '../../hooks/auth/useAnnouncedError.js';
import AnnouncedError from '../auth/AnnouncedError.js';

const BatchUpload = ({ lang, onBatchSaved }) => {
  const { t } = useTranslations(lang);
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  // Removed unused results state
  // Whole-form/server errors only (e.g. persistBatch failing) — per-field
  // validation uses each GCDS component's own errorMessage prop instead.
  const { error, errorCount, errorRef, setError, clearError } = useAnnouncedError();
  const [fileError, setFileError] = useState('');
  // { msg, token } set only when announceFileError() detects a repeat of the
  // same message — GcdsFileUploader's own errorMessage prop won't re-announce
  // an unchanged string, so this drives a supplementary sr-only live region
  // for that specific repeat. Rendering is gated on fileError === msg (see
  // JSX below) so it never lingers or re-fires for a later, genuinely new
  // error — those are already announced fine by GcdsFileUploader itself.
  const [fileErrorRepeat, setFileErrorRepeat] = useState(null);
  const [nameError, setNameError] = useState('');
  // Same repeat-announcement gap/fix as fileErrorRepeat above, for GcdsInput's
  // errorMessage on the batchName field.
  const [nameErrorRepeat, setNameErrorRepeat] = useState(null);
  const [fileUploaded, setFileUploaded] = useState(false);
  const [batchId, setBatchId] = useState(null);
  const [batchStatus, setBatchStatus] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [batchName, setBatchName] = useState('');
  // Hardcoded to 'google' until Canada.ca search is available
  const selectedSearch = 'google';
  const [selectedWorkflow, setSelectedWorkflow] = useState('GenericGraph');
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].value);
  const fileUploaderRef = useRef(null);
  const nameInputRef = useRef(null);
  // Bumped after a successful upload to remount GcdsFileUploader — its
  // `.value` prop doesn't reset the component's internal files/value state.
  const [fileUploaderKey, setFileUploaderKey] = useState(0);

  // Load the configured default model from Settings so batch matches the system default
  useEffect(() => {
    DataStoreService.getSetting('model.default', null).then(model => {
      if (model) setSelectedModel(model);
    }).catch(() => {});
  }, []);

  // Sets fileError, and — only when the new message is identical to the one
  // already showing (React would otherwise bail on the no-op state update,
  // so GcdsFileUploader's errorMessage prop never changes and nothing gets
  // re-announced) — records a fresh { msg, token } to force a one-off
  // supplementary announcement via the sr-only region below.
  const announceFileError = (msg) => {
    setFileError((prev) => {
      if (prev === msg && msg) {
        setFileErrorRepeat({ msg, token: `${Date.now()}-${Math.random()}` });
      }
      return msg;
    });
  };

  // Same repeat-announcement handling as announceFileError, for the
  // batchName field's GcdsInput errorMessage.
  const announceNameError = (msg) => {
    setNameError((prev) => {
      if (prev === msg && msg) {
        setNameErrorRepeat({ msg, token: `${Date.now()}-${Math.random()}` });
      }
      return msg;
    });
  };

  const handleFileChange = () => {
    clearError();
    setSuccessMessage('');
    const uploadedFile = fileUploaderRef.current?.files?.[0];

    if (!uploadedFile) {
      setFile(null);
      setFileError('');
      return;
    }

    if (!uploadedFile.name.toLowerCase().endsWith('.csv')) {
      announceFileError(t('batch.upload.error.invalidFile'));
      setFile(null);
      return;
    }

    setFileError('');
    setFile(uploadedFile);
    setFileUploaded(false);
  };

  // handleSearchToggle removed — uncomment when Canada.ca search is re-enabled

  const handleLanguageToggle = (e) => {
    setSelectedLanguage(e.target.value);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!processing) {
      if (!file) {
        announceFileError(t('batch.upload.error.noFile'));
        fileUploaderRef.current?.focus?.();
        return;
      }

      if (!batchName.trim()) {
        announceNameError(t('batch.upload.error.nameRequired'));
        nameInputRef.current?.focus?.();
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
        const entries = parseBatchCsv(text);

        if (!entries.length) {
          throw new Error(t('batch.upload.error.noValidRows'));
        }

        if (entries.length > MAX_BATCH_ITEMS) {
          throw new Error(t('batch.upload.error.tooManyRows'));
        }

        // Only keep fields needed: question variants and URLs
        const questionKeys = ['REDACTEDQUESTION'];
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
          aiProvider: selectedModel,
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
          clearError();
          setFileError('');
          setNameError('');
          setSuccessMessage(t('batch.upload.success'));
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
          // Remount the uploader so its internal files/value state actually
          // clears — setting .value alone doesn't reset the underlying
          // native <input>'s FileList, which would otherwise silently
          // resubmit the same file on a later upload.
          setFileUploaderKey((k) => k + 1);
        } catch (persistErr) {
          console.error('Failed to persist batch:', persistErr);
          setError(persistErr?.message || t('batch.upload.error.saveFailed'));
          // Re-show the upload button so the user can retry
          setFileUploaded(false);
          setProcessing(false);
        }
      } catch (err) {
        // Surface the actual parse error (e.g. missing column, empty file)
        // so the admin can see what's wrong with the CSV.
        const detail = {
          EMPTY_CSV: t('batch.upload.error.invalidCsv'),
          MISSING_QUESTION_COLUMN: t('batch.upload.error.missingQuestionColumn'),
        }[err?.code] || err?.message || t('batch.upload.error.readFailed');
        announceFileError(detail);
        fileUploaderRef.current?.focus?.();
        console.error('Error reading file:', err);
        // Re-show the upload button so the user can retry without re-selecting
        setFileUploaded(false);
        setProcessing(false);
      }
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
      <div className="text-measure">
        <GcdsStepper currentStep={1} totalSteps={3} tag="h3">
          {t('batch.upload.instructions.step1')}
        </GcdsStepper>
        <details className="mb-250">
          <summary className="mb-200">{t('batch.upload.instructions.step1Summary')}</summary>
          <ul className="list-disc mb-200 canada-ca-list-spcd-2">
            <li>{t('batch.upload.instructions.step1a')}</li>
            <li>{t('batch.upload.instructions.step1b')}</li>
            <li>{t('batch.upload.instructions.step1c')}</li>
            <li>{t('batch.upload.instructions.step1d')}</li>
            <li>{t('batch.upload.instructions.step1e')}</li>
          </ul>
        </details>
      </div>

      <form onSubmit={handleUpload} className="mt-400 text-measure">
        <GcdsStepper currentStep={2} totalSteps={3} tag="h3">
          {t('batch.upload.steps.step2Title')}
        </GcdsStepper>
        <div className="feedback-reason-card mb-500">
          <div className="mt-300 mb-250">
            <GcdsInput
              inputId="batchName"
              name="batchName"
              label={t('batch.upload.batchName')}
              value={batchName}
              onGcdsInput={(e) => {
                setBatchName(e.target.value);
                setNameError('');
              }}
              errorMessage={nameError}
              required
              ref={nameInputRef}
            />
            {/* Same repeat-announcement handling as the fileErrorRepeat region
                below — only renders for the exact repeat announceNameError()
                just recorded. */}
            {nameErrorRepeat && nameError === nameErrorRepeat.msg && (
              <span key={nameErrorRepeat.token} role="alert" className="sr-only">
                {nameError}
              </span>
            )}
          </div>

          {/* Search service toggle – commented out until Canada.ca search is available
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
                  <label className="me-200" htmlFor="google">
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
          */}

          <details className="mb-100 details-form">
            <summary className="mb-200">{t('batch.upload.advanced.title')}</summary>
            <GcdsSelect
              selectId="workflow"
              name="workflow"
              label={t('batch.upload.workflow.label')}
              hint={t('batch.upload.workflow.hint')}
              value={selectedWorkflow}
              onGcdsChange={(e) => setSelectedWorkflow(e.detail)}
            >
              {WORKFLOWS.map(w => (
                <option key={w.value} value={w.value}>{t(w.labelKey)}</option>
              ))}
            </GcdsSelect>

            <GcdsSelect
              selectId="model"
              name="model"
              label={t('batch.upload.model.label')}
              hint={t('batch.upload.model.hint')}
              value={selectedModel}
              onGcdsChange={(e) => setSelectedModel(e.detail)}
            >
              {AVAILABLE_MODELS.map(m => (
                <option key={m.value} value={m.value}>{t(m.labelKey)}</option>
              ))}
            </GcdsSelect>
          </details>

          <div className="mb-250 language-toggle">
            <GcdsFieldset legend={t('batch.upload.language.label')} legendSize="h6" aria-describedby="language-toggle-hint">
              <p className="mb-200" id="language-toggle-hint">
                {t('batch.upload.instructions.step3a')}
                <br />
                {t('batch.upload.instructions.step3b')}
              </p>
              <div className="gc-chckbxrdio md flex-center">
                <div className="radio me-200">
                  <input
                    type="radio"
                    id="english"
                    name="language-selection"
                    value="en"
                    checked={selectedLanguage === 'en'}
                    onChange={handleLanguageToggle}
                  />
                  <label htmlFor="english">{t('batch.upload.language.english')}</label>
                </div>
                <div className="radio">
                  <input
                    type="radio"
                    id="french"
                    name="language-selection"
                    value="fr"
                    checked={selectedLanguage === 'fr'}
                    onChange={handleLanguageToggle}
                  />
                  <label htmlFor="french">{t('batch.upload.language.french')}</label>
                </div>
              </div>
            </GcdsFieldset>
          </div>

          <GcdsFileUploader
            key={fileUploaderKey}
            className="csv-file-uploader"
            uploaderId="csvFile"
            name="csvFile"
            label={t('batch.upload.file.label')}
            accept=".csv"
            required
            errorMessage={fileError}
            onGcdsChange={handleFileChange}
            ref={fileUploaderRef}
          />
          {/* GcdsFileUploader's own inline error covers sighted users and the
              first announcement. This sr-only region renders only for the
              exact repeat announceFileError() just recorded — gated on
              fileError matching fileErrorRepeat.msg so it never lingers past
              a later, genuinely new error (which GcdsFileUploader's own alert
              already announces on its own, and double-announcing here would
              be redundant). */}
          {fileErrorRepeat && fileError === fileErrorRepeat.msg && (
            <span key={fileErrorRepeat.token} role="alert" className="sr-only">
              {fileError}
            </span>
          )}

          {file && !fileUploaded && (
            <button type="submit" className="btn-primary">
              {t('batch.upload.buttons.upload')}
            </button>
          )}

          {successMessage && (
            <p className="thank-you" role="status">
              <span className="gcds-icon fa fa-solid fa-check-circle" aria-hidden="true"></span>
              {successMessage}
            </p>
          )}
        </div>

        {error && (
          <AnnouncedError
            id="batch-upload-error"
            message={error}
            errorCount={errorCount}
            inputRef={errorRef}
            className="form-error-message font-size-text-sm-nr mb-125"
          />
        )}

        <div className="text-measure">
          <GcdsStepper currentStep={3} totalSteps={3} tag="h3">
            {t('batch.upload.steps.step3Title')}
          </GcdsStepper>
          <p className="mb-100">{t('batch.upload.instructions.reviewIncomplete')}</p>
          <p className="mb-200">
            <a href="#running-evaluation">{t('batch.upload.instructions.incompleteLinkText')}</a>
          </p>
          <details className="mb-250">
            <summary className="mb-200">{t('batch.upload.instructions.tipsTitle')}</summary>
            <p>{t('batch.upload.instructions.step6')}</p>
            <p>{t('batch.upload.instructions.step7')}</p>
          </details>
        </div>

        {processing && (
          <div role="status" className="mb-125">
            {t('batch.upload.processing')}
          </div>
        )}
      </form>
    </GcdsContainer>
  );
};

export default BatchUpload;
