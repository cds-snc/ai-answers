import { GcdsBreadcrumbs, GcdsBreadcrumbsItem, GcdsContainer, GcdsText } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../hooks/useTranslations.js';

const NotFoundPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const homeHref = `/${lang}`;

  return (
    <GcdsContainer size="xl" centered tag="article" className="mt-400">
      <GcdsBreadcrumbs>
        <GcdsBreadcrumbsItem href={homeHref}>
          {t('notFound.breadcrumb')}
        </GcdsBreadcrumbsItem>
      </GcdsBreadcrumbs>
      <h1>{t('notFound.title')}</h1>
      <GcdsText>{t('notFound.message')}</GcdsText>
      <GcdsText>
        <a href={homeHref}>{t('notFound.homeLink')}</a>
      </GcdsText>
    </GcdsContainer>
  );
};

export default NotFoundPage;
