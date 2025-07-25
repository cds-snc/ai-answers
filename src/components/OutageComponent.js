import React from 'react';
import { GcdsContainer, GcdsNotice, GcdsText } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../hooks/useTranslations.js';

const OutageComponent = () => {
  const { t } = useTranslations();
  return (
    <GcdsContainer size="xl" mainContainer centered style={{ paddingBottom: '2rem' }}>
      <GcdsNotice type="warning" noticeTitleTag="h2" noticeTitle={t('outage.title')} className="mb-400">
        <GcdsText>Service is at capacity, please try again later.</GcdsText>
      </GcdsNotice>
    </GcdsContainer>
  );
};

export default OutageComponent;
