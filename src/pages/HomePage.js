// src/pages/HomePage.js
import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import ChatAppContainer from "../components/chat/ChatAppContainer.js";
import {
  GcdsContainer,
  GcdsDetails,
  GcdsText,
  GcdsLink,
} from "@cdssnc/gcds-components-react";
import { useTranslations } from "../hooks/useTranslations.js";
import DataStoreService from "../services/DataStoreService.js";
import SessionService from "../services/SessionService.js";
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
  const { t } = useTranslations(lang);
  const [searchParams] = useSearchParams();
  const reviewChatId = searchParams.get("chat");
  const reviewMode = searchParams.get("review") === "1";
  const isPrivileged = useHasAnyRole(["admin", "partner"]);
  const [serviceStatus, setServiceStatus] = useState({
    isAvailable: null,
    sessionAvailable: null,
    message: "",
  });
  const [chatId, setChatId] = useState(reviewChatId || null);
  const [initialMessages, setInitialMessages] = useState([]);
  const [reviewReferringUrl, setReviewReferringUrl] = useState(null);
  // Capture client-side referrer (if available) so we can pass it into the
  // chat component for new chats. Keep this safe for SSR/tests by guarding
  // access to `document`.
  const clientReferrer = (() => {
    try {
      if (typeof document !== 'undefined' && document.referrer) {
        return document.referrer;
      }
    } catch (e) {
      // no-op: tests or SSR may not have document
    }
    return null;
  })();
  // Removed unused isLoadingSiteStatus state
  const [chatSessionFailed, setChatSessionFailed] = useState(false);

  useEffect(() => {
    // Use client SessionService wrapper which checks siteSetting + sessions via API
    (async () => {
      try {
        const ok = await SessionService.isAvailable();
        // isAvailable() returns true only when site is 'available' AND sessions exist
        // We set sessionAvailable = ok and isAvailable = ok for compatibility with existing logic
        setServiceStatus({ isAvailable: ok, sessionAvailable: ok, message: ok ? '' : t('homepage.errors.serviceUnavailable') });
      } catch (e) {
        setServiceStatus({ isAvailable: false, sessionAvailable: false, message: t('homepage.errors.serviceUnavailable') });
      }
    })();
  }, [t]);

  async function fetchSession() {
    try {
      const data = await DataStoreService.getChatSession();
      if (data && data.chatId) {
        setChatId(data.chatId);
        localStorage.setItem("chatId", data.chatId);
        setChatSessionFailed(false);
      } else {
        setChatSessionFailed(true);
      }
    } catch (error) {
      setChatSessionFailed(true);
      console.error("Failed to get chat session:", error);
    }
  }

  useEffect(() => {
    if (reviewChatId) return;
    // Only fetch a chat session if not explicitly unavailable (site and sessions), or if privileged
    const siteNotFalse = serviceStatus.isAvailable !== false;
    const sessionsNotFalse = serviceStatus.sessionAvailable !== false;
    if (isPrivileged || (siteNotFalse && sessionsNotFalse)) {
      if (!chatId) {
        fetchSession();
      }
    }
  }, [serviceStatus.isAvailable, isPrivileged, chatId, reviewChatId]);

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
          console.error("Failed to load chat", err);
        });
    }
  }, [reviewChatId]);

  const WrappedErrorBoundary = ({ children }) => (
    <ErrorBoundary t={t}>{children}</ErrorBoundary>
  );

  if (serviceStatus.isAvailable === false || chatSessionFailed) {
    return <OutageComponent />;
  }

  return (
    <WrappedErrorBoundary>
      <style>{`
        .feedback-survey-link {
          display: none;
        }
        
        .ai-message-content ~ * .feedback-survey-link,
        .feedback-survey-link:has(~ .ai-message-content),
        body:has(.ai-message-content) .feedback-survey-link {
          display: inline !important;
        }
      `}</style>

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
        <ChatAppContainer
          lang={lang}
          chatId={chatId}
          readOnly={reviewMode}
          initialMessages={initialMessages}
          // Pass saved review value separately, and clientReferrer separately.
          // ChatAppContainer will prefer pageUrl when present and ignore clientReferrer.
          initialReferringUrl={reviewReferringUrl}
          clientReferrer={clientReferrer}
        />
      </div>
      {!reviewMode && (
        <div className="mb-600 container-custom">
          {/* Feedback survey link - shown/hidden via CSS based on AI responses */}
          <GcdsText>
            <a
              href={t("homepage.feedback.surveyUrl")}
              className="feedback-survey-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("homepage.feedback.surveyLink")}
            </a>
          </GcdsText>
          <GcdsDetails
            detailsTitle={t("homepage.about.title")}
            className="mb-400"
            tabIndex={0}
          >
            <GcdsText>{t("homepage.about.builtBy")}</GcdsText>
            <GcdsText>{t("homepage.about.aiServices.azure")}</GcdsText>
            <GcdsText className="mt-300">
              <GcdsLink
                href={lang === "fr" ? "/fr/about" : "/en/about"}
              >
                {lang === "fr" ? "Lire plus sur Réponses IA" : "Learn more about AI Answers"}
              </GcdsLink>
            </GcdsText>
          </GcdsDetails>
        </div>
      )}
    </WrappedErrorBoundary>
  );
};

export default HomePage;
