import React from 'react';
import { GcdsContainer, GcdsNotice, GcdsText } from '@gcds-core/components-react';
import { useTranslations } from '../hooks/useTranslations.js';

const OutageComponent = ({ lang }) => {
  const { t } = useTranslations(lang);
  return (
    <GcdsContainer layout="page" style={{ paddingBottom: '2rem' }}>
      <GcdsNotice
        noticeRole="warning"
        noticeTitleTag="h2"
        noticeTitle={t('outage.title')}
        className="mb-400"
      >
        <GcdsText>{t('outage.message')}</GcdsText>
      </GcdsNotice>
    </GcdsContainer>
  );
};

export default OutageComponent;
