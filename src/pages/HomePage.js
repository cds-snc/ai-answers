// src/pages/HomePage.js
import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import ChatAppContainer from "../components/chat/ChatAppContainer.js";
import ChatReviewPage from "./ChatReviewPage.js";
import {
  GcdsContainer,
  GcdsDetails,
  GcdsNotice,
  GcdsText,
} from "@gcds-core/components-react";
import { useTranslations } from "../hooks/useTranslations.js";
import { useAuth } from "../contexts/AuthContext.js";
import DataStoreService from "../services/DataStoreService.js";
import OutageComponent from "../components/OutageComponent.js";
import { getPath } from "../utils/routes.js";
import { CanadaCaAccessibleLabel } from "../utils/pronounceCanadaCa.js";
import { getAnswerLanguage } from "../utils/answerLanguage.js";

// Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <GcdsContainer layout="page">
          <h2>{t("homepage.errors.timeout.title")}</h2>
          <p className="mb-300">{t("homepage.errors.timeout.message")}</p>
          <button
            onClick={() => window.location.reload()}
            className="gcds-button gcds-button--primary"
          >
            {t("homepage.errors.timeout.button")}
          </button>{" "}
        </GcdsContainer>
      );
    }
    return this.props.children;
  }
}

const HomePage = ({ lang = "en" }) => {
  const { loading: authLoading } = useAuth();
  const { t } = useTranslations(lang);
  const [searchParams] = useSearchParams();
  const reviewChatId = searchParams.get("chat");
  const reviewMode = searchParams.get("review") === "1";
  // The reviewing admin's own current UI language, carried forward as a
  // query param by reviewLink.js's buildChatReviewLinkHtml/buildChatReviewHref
  // rather than by the route itself - the route (`lang`) stays tied to the
  // reviewed chat's own pageLanguage so the transcript (answer bubbles,
  // citation heading) shows what the end user actually saw. `adminLang` is
  // for the admin-only chrome around that transcript (ExpertFeedbackPanel,
  // "How was this answer?", Chat ID/Date/Referring URL labels) to use
  // instead of silently inheriting the chat's language. Falls back to the
  // route's own `lang` outside review mode / when absent.
  const adminLang = searchParams.get("adminLang") || lang;
  // Parse interaction from hash (e.g. #interaction=interactionId5abcd)
  const getInteractionFromHash = () => {
    try {
      if (typeof window === 'undefined' || !window.location) return null;
      const raw = window.location.hash || '';
      if (!raw) return null;
      const params = new URLSearchParams(raw.replace(/^#/, ''));
      return params.get('interaction');
    } catch (e) {
      return null;
    }
  };
  const [targetInteractionId, setTargetInteractionId] = useState(getInteractionFromHash());
  const [serviceStatus, setServiceStatus] = useState({
    isAvailable: null,
    sessionAvailable: null,
    message: "",
  });
  const [chatId, setChatId] = useState(reviewChatId || null);
  const [initialMessages, setInitialMessages] = useState([]);
  const [reviewReferringUrl, setReviewReferringUrl] = useState(null);
  const [chatCreatedAt, setChatCreatedAt] = useState(null);
  const [showWarningNotice] = useState(false); // set to true to turn on warning, message is in locales


  // Capture client-side referrer (if available) so we can pass it into the
  // chat component for new chats. Keep this safe for SSR/tests by guarding
  // access to `document`. Do NOT forward same-site/self referrers (they come
  // from our own site) — treat those as absent.
  const clientReferrer = (() => {
    try {
      if (typeof document === 'undefined' || !document.referrer) return null;
      const ref = document.referrer;
      try {
        const refUrl = new URL(ref);
        // If we have window.location (client) and the referrer origin matches
        // our origin, treat this as a same-site referral and drop it.
        if (typeof window !== 'undefined' && window.location && refUrl.origin === window.location.origin) {
          return null;
        }
        return ref;
      } catch (e) {
        // If parsing fails, do not forward an unparseable referrer
        return null;
      }
    } catch (e) {
      // no-op: tests or SSR may not have document
    }
    return null;
  })();
  // Removed unused isLoadingSiteStatus state
  const [chatSessionFailed, setChatSessionFailed] = useState(false);
  // const [isLoading, setIsLoading] = useState(false);

  // Lazy init: chatId will be null initially and set from server response after first message.
  // Use the same server-side availability check that is enforced when a new
  // anonymous chat session is created. This keeps the UI from offering a
  // session slot that the backend will immediately reject.
  useEffect(() => {
    if (!authLoading && !reviewChatId) {
      DataStoreService.getChatSessionAvailability().then(({ siteStatus, sessionAvailable }) => {
        if (siteStatus && sessionAvailable) {
          setServiceStatus({ isAvailable: true, sessionAvailable: true, message: '' });
        } else {
          setServiceStatus({ isAvailable: false, sessionAvailable: false, message: t('homepage.errors.serviceUnavailable') });
        }
      });
    }
  }, [authLoading, reviewChatId, t]);

  useEffect(() => {
    if (reviewChatId) {
      DataStoreService.getChat(reviewChatId)
        .then((data) => {
          const chat = data.chat;
          if (!chat || !Array.isArray(chat.interactions)) {
            setInitialMessages([]);
            setReviewReferringUrl(null);
            return;
          }
          // Extract referring URL from interactions (stored at interaction level, not chat level)
          // Find the first non-empty referringUrl from any interaction
          const foundReferringUrl = chat.interactions.find(inter => inter?.referringUrl)?.referringUrl;
          setReviewReferringUrl(foundReferringUrl || null);

          // Extract createdAt date
          const chatDate = chat.createdAt;
          setChatCreatedAt(chatDate);

          const msgs = [];
          chat.interactions.forEach((inter) => {
            if (inter && inter.question) {
              msgs.push({
                id: inter.interactionId,
                text: inter.question?.redactedQuestion || "",
                sender: "user",
                // The detected question language, not the whole interaction
                // object the paired AI message gets below - without this,
                // ChatInterface.js's question-bubble lang tag
                // (toLangAttr(message.questionLanguage)) has nothing to read
                // and silently renders no lang attribute at all. Deliberately
                // not `interaction: inter` here - see ChatAppContainer.js's
                // matching comment for why a user-sender message should
                // never carry a real `.interaction` (server-side code reads
                // `.interaction` presence as "this is the AI's turn").
                questionLanguage: getAnswerLanguage(inter),
              });
            }
            if (inter) {
              msgs.push({
                id: inter.interactionId,
                interaction: inter,
                sender: "ai",
                aiService: chat.aiProvider,
              });
            }
          });
          setInitialMessages(msgs.filter(Boolean));
        })
        .catch((err) => {
          setInitialMessages([]);
          setReviewReferringUrl(null);
          setChatCreatedAt(null);
          console.error("Failed to load chat", err);
        });
      // capture any interaction id from the hash so the chat can scroll to it
      try {
        const interactionFromHash = getInteractionFromHash();
        if (interactionFromHash) setTargetInteractionId(interactionFromHash);
      } catch (e) { /* ignore */ }
    }
  }, [reviewChatId]);

  const handleSessionError = (err) => {
    console.error('Session Error:', err);
    setServiceStatus({
      isAvailable: false,
      sessionAvailable: false,
      message: t('homepage.errors.serviceUnavailable')
    });
    setChatSessionFailed(true);
  };

  if (serviceStatus.isAvailable === false || chatSessionFailed) {
    return <OutageComponent lang={lang} />;
  }

  // Swapped in for the whole page, same URL - review mode never needed the
  // public "ask a new question" chrome below (H1/subtitle/privacy
  // disclosure), and ChatReviewPage.js gives it its own admin-appropriate
  // header/H1 instead. Data fetched above (initialMessages, chatCreatedAt,
  // reviewReferringUrl, targetInteractionId) is review-mode-only already -
  // reused as-is, not recomputed.
  if (reviewMode) {
    return (
      <ChatReviewPage
        lang={lang}
        adminLang={adminLang}
        chatId={chatId}
        initialMessages={initialMessages}
        chatCreatedAt={chatCreatedAt}
        referringUrl={reviewReferringUrl}
        targetInteractionId={targetInteractionId}
        onSessionError={handleSessionError}
        onChatIdUpdate={setChatId}
      />
    );
  }

  return (
    <ErrorBoundary t={t}>
      <div className="mb-600 container-custom">
        <h1 className="mb-400">{t("homepage.title")}</h1>
        <CanadaCaAccessibleLabel
          as="h2"
          className="homepage-subtitle mt-0"
          text={t("homepage.subtitle")}
          lang={lang}
        />
        <CanadaCaAccessibleLabel as="p" className="mb-200" text={t("homepage.intro.researchOnly")} lang={lang} />
        <GcdsDetails
          detailsTitle={t("homepage.privacy.title")}
          className="mb-400"
          tabIndex={0}
        >
          <p className="mb-300">{t("homepage.privacy.storage")}</p>
          <p className="mb-300">{t("homepage.privacy.disclaimer")}</p>
          <p className="mb-300">{t("homepage.privacy.language")}</p>
          <p className="mb-300">
            {t("homepage.privacy.terms")}{" "}
            <CanadaCaAccessibleLabel
              as="a"
              href={
                lang === "fr"
                  ? "https://www.canada.ca/fr/transparence/avis.html"
                  : "https://www.canada.ca/en/transparency/terms.html"
              }
              text={t("homepage.privacy.termsLink")}
              lang={lang}
            />.
          </p>
        </GcdsDetails>
        {showWarningNotice && (
          <GcdsNotice
            noticeRole="warning"
            noticeTitleTag="h3"
            noticeTitle={t("homepage.warning.title")}
            className="mt-200"
          >
            <GcdsText>{t("homepage.warning.message")}</GcdsText>
          </GcdsNotice>
        )}
        <ChatAppContainer
          lang={lang}
          chatId={chatId}
          initialMessages={initialMessages}
          // Populated whenever ?chat= is present, review=1 or not - a
          // ?chat=X URL with no &review=1 resumes that chatId live
          // (editable), not read-only, so these still matter here even
          // though reviewMode is guaranteed false past the early return
          // above. Pass saved review value separately, and clientReferrer
          // separately - ChatAppContainer will prefer pageUrl when present
          // and ignore clientReferrer.
          initialReferringUrl={reviewReferringUrl}
          chatCreatedAt={chatCreatedAt}
          clientReferrer={clientReferrer}
          targetInteractionId={targetInteractionId}
          onSessionError={handleSessionError}
          onChatIdUpdate={setChatId}
        />
      </div>
      <div className="mb-600 container-custom">
        <p className="mb-300">
          <CanadaCaAccessibleLabel as="span" text={t("homepage.about.builtBy")} lang={lang} />{" "}
          <a href={getPath('about', lang)}>
            {t("homepage.about.learnMore")}
          </a>.
        </p>
      </div>
    </ErrorBoundary>
  );
};

export default HomePage;
