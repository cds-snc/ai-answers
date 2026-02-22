// src/pages/HomePage.js
import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import ChatAppContainer from "../components/chat/ChatAppContainer.js";
import {
  GcdsContainer,
  GcdsDetails,
  GcdsText,
  GcdsLink,
  GcdsNotice,
} from "@cdssnc/gcds-components-react";
import { useTranslations } from "../hooks/useTranslations.js";
import { useAuth } from "../contexts/AuthContext.js";
import DataStoreService from "../services/DataStoreService.js";
import OutageComponent from "../components/OutageComponent.js";
import { useHasAnyRole } from "../components/RoleBasedUI.js";

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
        <GcdsContainer size="xl" mainContainer centered>
          <h2>{t("homepage.errors.timeout.title")}</h2>
          <GcdsText>{t("homepage.errors.timeout.message")}</GcdsText>
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
  // const isPrivileged = useHasAnyRole(["admin", "partner"]);
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

  // Fetch session and availability in one go
  // [DEPRECATED] Removal of chat-init call for lazy-init architecture

  // Lazy init: chatId will be null initially and set from server response after first message.
  // Check siteStatus so admins can take the site offline via SettingsPage.
  useEffect(() => {
    if (!authLoading && !reviewChatId) {
      DataStoreService.getSiteStatus().then((status) => {
        if (status === 'available') {
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
    return <OutageComponent />;
  }

  return (
    <ErrorBoundary t={t}>
      <div className="mb-600 container-custom">
        <h1 className="mb-400">{t("homepage.title")}</h1>
        <h2
          className="mt-400 mb-400"
          aria-label={t("homepage.subtitle.ariaLabel")}
        >
          <span className="aria-hidden">{t("homepage.subtitle.text")}</span>
        </h2>
        <GcdsText className="mb-200">
          {t("homepage.intro.researchOnly")}
        </GcdsText>
        <GcdsDetails
          detailsTitle={t("homepage.privacy.title")}
          className="mb-400"
          tabIndex={0}
        >
          <GcdsText>{t("homepage.privacy.storage")}</GcdsText>
          <GcdsText>{t("homepage.privacy.disclaimer")}</GcdsText>
          <GcdsText>
            {t("homepage.privacy.terms")}{" "}
            <GcdsLink
              href={
                lang === "fr"
                  ? "https://www.canada.ca/fr/transparence/avis.html"
                  : "https://www.canada.ca/en/transparency/terms.html"
              }
            >
              {t("homepage.privacy.termsLink")}
            </GcdsLink>
          </GcdsText>
        </GcdsDetails>
        {showWarningNotice && (
          <GcdsNotice
            type="warning"
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
          readOnly={reviewMode}
          initialMessages={initialMessages}
          // Pass saved review value separately, and clientReferrer separately.
          // ChatAppContainer will prefer pageUrl when present and ignore clientReferrer.
          initialReferringUrl={reviewReferringUrl}
          chatCreatedAt={chatCreatedAt}
          clientReferrer={clientReferrer}
          targetInteractionId={targetInteractionId}
          onSessionError={handleSessionError}
          onChatIdUpdate={setChatId}
        />
      </div>
      {!reviewMode && (
        <div className="mb-600 container-custom">
          <GcdsText>
            {t("homepage.about.builtBy")}{" "}
            <GcdsLink
              href={lang === "fr" ? "/fr/about" : "/en/about"}
            >
              {lang === "fr" ? "Lire plus sur Réponses IA" : "Learn more about AI Answers"}
            </GcdsLink>
          </GcdsText>
        </div>
      )}
    </ErrorBoundary>
  );
};

export default HomePage;
