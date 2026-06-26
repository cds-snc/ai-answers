import { GcdsContainer, GcdsText } from '@gcds-core/components-react';
import { useTranslations } from '../hooks/useTranslations.js';

const NotFoundPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const homeHref = `/${lang}`;

  return (
    <GcdsContainer layout="page" tag="article" className="mt-400">
      <h1>{t('notFound.title')}</h1>
      <GcdsText>{t('notFound.message')}</GcdsText>
      <GcdsText>
        <a href={homeHref}>{t('notFound.homeLink')}</a>
      </GcdsText>
    </GcdsContainer>
  );
};

export default NotFoundPage;
