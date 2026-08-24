// src/pages/ChatReviewPage.js
import React from "react";
import { GcdsContainer, GcdsLink } from "@gcds-core/components-react";
import ChatAppContainer from "../components/chat/ChatAppContainer.js";
import { useTranslations } from "../hooks/useTranslations.js";

// Dedicated admin view for reviewing a finished chat - swapped in by
// HomePage.js (same URL: /{lang}?chat=...&review=1&adminLang=...) instead of
// the public "ask a new question" homepage chrome (H1/subtitle/privacy
// disclosure), which made no sense for an admin reviewing a chat that's
// already happened - only the bottom "built by..." footer was ever actually
// hidden in review mode before this, leaving the public framing intact.
//
// This page's own header/H1/nav is always `adminLang` (the reviewing
// admin's own current UI language) - no per-element language decision here,
// since the whole page other than the transcript itself IS admin chrome.
// `lang` (the reviewed chat's own pageLanguage - unchanged, still the route
// itself, per docs/coding-agent-docs/official-languages.md Rule 2) and
// `adminLang` both still get threaded into ChatAppContainer exactly as
// before this page existed - readOnly rendering (bubbles + inline review
// panels, citation heading) is unchanged, only the surrounding page chrome
// moved. No separate "Viewing chat" H2 here - ChatAppContainer already has
// its own (visually hidden) H2 for the conversation region
// (homepage.chat.section.heading), so the heading hierarchy is already
// sound without one.
const ChatReviewPage = ({
  lang,
  adminLang,
  chatId,
  initialMessages,
  chatCreatedAt,
  referringUrl,
  targetInteractionId,
  onSessionError,
  onChatIdUpdate,
}) => {
  const { t } = useTranslations(adminLang);

  return (
    <GcdsContainer layout="page" className="mb-600">
      {/* Split/"stacked" h1 - see admin.css's .canada-ca-h1-stacked__eyebrow
          comment for the full explanation of this Canada.ca Specifications/
          GCWeb pattern. "Admin view" as the small eyebrow, the site's own
          brand name ("AI Answers") as the large title below it - same brand
          name/key as HomePage.js's own H1, just reordered under the eyebrow
          here instead of standing alone. */}
      <h1 className="mb-400" lang={adminLang}>
        <span className="canada-ca-h1-stacked__eyebrow">{t('homepage.chat.review.eyebrow')}</span>
        <span className="canada-ca-h1-stacked__title">{t('homepage.title')}</span>
      </h1>
      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')} lang={adminLang}>
        <GcdsLink href={`/${adminLang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
      </nav>
      <ChatAppContainer
        lang={lang}
        chatId={chatId}
        readOnly
        initialMessages={initialMessages}
        initialReferringUrl={referringUrl}
        chatCreatedAt={chatCreatedAt}
        adminLang={adminLang}
        clientReferrer={null}
        targetInteractionId={targetInteractionId}
        onSessionError={onSessionError}
        onChatIdUpdate={onChatIdUpdate}
      />
    </GcdsContainer>
  );
};

export default ChatReviewPage;
