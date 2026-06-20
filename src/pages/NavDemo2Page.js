import React from 'react';
import { GcdsContainer } from '@gcds-core/components-react';
import { useTranslations } from '../hooks/useTranslations.js';

const NavDemo2Page = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  return (
    <GcdsContainer layout="page" tag="main" className="mb-600">
      <h1 className="mb-400">{t('navVariant.demo2Title')}</h1>
      <p>{t('navVariant.demoPlaceholder')}</p>
    </GcdsContainer>
  );
};

export default NavDemo2Page;
