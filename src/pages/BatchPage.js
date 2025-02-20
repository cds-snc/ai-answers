import React from 'react';
import { GcdsContainer, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import BatchUpload from '../components/batch/BatchUpload.js';
import BatchList from '../components/batch/BatchList.js';
import { getApiUrl,getProviderApiUrl } from '../utils/apiToUrl.js';
import { useTranslations } from '../hooks/useTranslations.js';
import ExportService from '../services/ExportService.js';



const BatchPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const handleDownloadClick = async (batchId, type) => {
    console.log('Button clicked for batch:', batchId);
    const response = await fetch(getApiUrl(`db-batch-retrieve?batchId=${batchId}`));
    const batch = await response.json();
    const batches = [batch];
    const fileName = `${batch.name}-${batch.type}.${type === 'excel' ? 'xlsx' : 'csv'}`;
    ExportService.export(batches, fileName);
  };

  const handleCompleteCancelClick = async (batchId, action, provider,) => {
    if (action === 'cancel') {
      console.log('Button clicked to cancel batch:', batchId);
      await fetch(getProviderApiUrl(provider, `batch-cancel?batchId=${batchId}`));
    } else {
      console.log('Button clicked to complete batch:', batchId);
      await fetch(getProviderApiUrl(provider, `batch-process-results?batchId=${batchId}`));
    }
  };

  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
      <h1 className='mb-400'>{t('batch.navigation.title')}</h1>
      <nav className="mb-400" aria-label={t('batch.navigation.ariaLabel')}>
        <h2 className='mt-400 mb-400'>{t('batch.navigation.links.onThisPage')}</h2>
        <ul>
          <li className="mb-400">
            <GcdsText>
              <GcdsLink href="#evaluator">{t('batch.navigation.links.newEvaluation')}</GcdsLink>
            </GcdsText>
          </li>
          <li className="mb-400">
            <GcdsText>
              <GcdsLink href="#running-evaluation">{t('batch.navigation.links.runningBatches')}</GcdsLink>
            </GcdsText>
          </li>
          <li className="mb-400">
            <GcdsText>
              <GcdsLink href="#processed-evaluation">{t('batch.navigation.links.processedBatches')}</GcdsLink>
            </GcdsText>
          </li>
        </ul>
      </nav>

      <section id="evaluator" className="mb-600">
        <h2 className='mt-400 mb-400'>{t('batch.sections.evaluator.title')}</h2>
        <BatchUpload lang={lang} />
      </section>

      <section id="running-evaluation" className="mb-600">
        <h2 className='mt-400 mb-400'>{t('batch.sections.running.title')}</h2>
        <BatchList
          buttonAction={handleCompleteCancelClick}
          batchStatus="validating,failed,in_progress,finalizing,completed,expired" lang={lang} />
      </section>

      <section id="processed-evaluation" className="mb-600">
        <h2 className='mt-400 mb-400'>{t('batch.sections.processed.title')}</h2>
        <BatchList
          buttonAction={handleDownloadClick}
          batchStatus="processed" lang={lang} />
      </section>

    </GcdsContainer>
  );
};

export default BatchPage;