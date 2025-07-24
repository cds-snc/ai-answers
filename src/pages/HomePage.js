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
    message: "",
  });
  const [chatId, setChatId] = useState(reviewChatId || null);
  const [initialMessages, setInitialMessages] = useState([]);
  const [isLoadingSiteStatus, setIsLoadingSiteStatus] = useState(true);
  const [chatSessionFailed, setChatSessionFailed] = useState(false);

  useEffect(() => {
    DataStoreService.getSiteStatus()
      .then((status) => {
        if (status === "available") {
          setServiceStatus({ isAvailable: true, message: "" });
        } else if (status === "unavailable") {
          setServiceStatus({
            isAvailable: false,
            message: t("homepage.errors.serviceUnavailable"),
          });
        } else {
          setServiceStatus({
            isAvailable: false,
            message: t("homepage.errors.serviceUnavailable"),
          });
        }
        setIsLoadingSiteStatus(false);
      })
      .catch(() => {
        setServiceStatus({
          isAvailable: false,
          message: t("homepage.errors.serviceUnavailable"),
        });
        setIsLoadingSiteStatus(false);
      });
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
    if (serviceStatus.isAvailable !== false || isPrivileged) {
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
            return;
          }
          const msgs = [];
          chat.interactions.forEach((inter, idx) => {
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

      <GcdsContainer
        size="xl"
        mainContainer
        centered
        tag="main"
        className="mb-600"
      >
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
        <GcdsDetails
          detailsTitle={t("homepage.immigration.title")}
          className="mb-400"
          tabIndex={0}
        >
          <GcdsText>{t("homepage.immigration.advice")}</GcdsText>
          <GcdsText>
            {t("homepage.immigration.explore")}{" "}
            <GcdsLink
              href={
                lang === "fr"
                  ? "https://ircc.canada.ca/explorer-programmes/index.asp"
                  : "https://ircc.canada.ca/explore-programs/index.asp"
              }
            >
              {t("homepage.immigration.exploreLink")}
            </GcdsLink>
          </GcdsText>
        </GcdsDetails>
        <ChatAppContainer
          lang={lang}
          chatId={chatId}
          readOnly={reviewMode}
          initialMessages={initialMessages}
        />
      </GcdsContainer>
      <GcdsContainer
        size="xl"
        mainContainer
        centered
        tag="below"
        className="mb-600"
        tabIndex={0}
      >
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
          <GcdsText>{t("homepage.about.contact")}</GcdsText>
          <GcdsText>
            <GcdsLink
              href={
                lang === "fr"
                  ? "https://numerique.canada.ca/"
                  : "https://digital.canada.ca/"
              }
            >
              {t("homepage.about.cdslink")}
            </GcdsLink>
          </GcdsText>
        </GcdsDetails>
      </GcdsContainer>
    </WrappedErrorBoundary>
  );
};

export default HomePage;
