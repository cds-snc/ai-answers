# Evaluation Service Architecture (Current Flow)

This document describes the current architecture and lifecycle of the evaluation system as of January 2026.

## 1. Sequence Diagram: Interaction Persistence & Evaluation Trigger

The following diagram shows how a new chat interaction triggers an automatic evaluation.

```mermaid
sequenceDiagram
    participant User
    participant ChatAPI as api/chat/chat-message.js
    participant IPS as InteractionPersistenceService
    participant ES as EvaluationService
    participant EW as evaluation.worker.js
    participant DB as MongoDB (Interaction/Eval/EF)

    User->>ChatAPI: Send message
    ChatAPI->>IPS: persistInteraction(payload)
    IPS->>DB: Save Interaction docs
    
    IPS->>ES: evaluateInteraction(dbInteraction, chatId)
    
    alt DeploymentMode = 'Vercel'
        ES->>EW: import & invoke default() (Serial)
        EW->>DB: Process & Save Eval
        EW-->>ES: result
    else DeploymentMode = 'CDS'
        ES->>ES: init Piscina Worker Pool
        ES->>EW: pool.run(payload) (Async)
        EW->>DB: Process & Save Eval
        EW-->>ES: result
    end
    
    ES-->>IPS: result (Logged)
    IPS-->>ChatAPI: { success: true }
```

## 2. Class Diagram: Core Evaluation Components

While the system is primarily functional/service-oriented, the following diagram represents the logical relationships between services and data models.

```mermaid
classDiagram
    class EvaluationService {
        +evaluateInteraction(interaction, chatId, options)
        +processEvaluationsForDuration(duration, lastId, filter)
        +getEvaluationForInteraction(interactionId)
        +deleteEvaluations(options)
    }

    class EvaluationWorker {
        <<Thread/Process>>
        +default(payload)
        -findSimilarEmbeddingsWithFeedback()
        -findBestSentenceMatches()
        -findBestCitationMatch()
        -createEvaluation()
        -createNoMatchEvaluation()
    }

    class InteractionPersistenceService {
        +persistInteraction(chatId, interaction, user, options)
    }

    class VectorService {
        +search(vector, limit, type, options)
        +addExpertFeedbackEmbedding(payload)
    }

    class Interaction {
        +String interactionId
        +ObjectId question
        +ObjectId answer
        +ObjectId autoEval
        +ObjectId expertFeedback
    }

    class Eval {
        +Boolean processed
        +Boolean hasMatches
        +ObjectId expertFeedback
        +Object sentenceMatchTrace
    }

    class ExpertFeedback {
        +Number totalScore
        +String type
        +Number citationScore
        +Array sentenceScores
    }

    InteractionPersistenceService --> EvaluationService : triggers
    EvaluationService --> EvaluationWorker : offloads
    EvaluationWorker --> VectorService : queries
    EvaluationWorker --> Interaction : reads
    EvaluationWorker --> Eval : creates
    EvaluationWorker --> ExpertFeedback : creates (type='ai')
    Eval o-- ExpertFeedback : contains
    Interaction o-- Eval : links to
```

## 3. Flow Diagram: Evaluation Logic (Inside Worker)

This diagram details the decision logic used by `evaluation.worker.js` to determine an interaction's score.

```mermaid
flowchart TD
    Start([Start Evaluation]) --> Fetch[Fetch Interaction & Question/Answer]
    Fetch --> Validation{Valid & No Existing?}
    
    Validation -->|No| End([End])
    Validation -->|Yes| Embedding[Fetch Embeddings]
    
    Embedding --> QASearch[Search Similar Q-A Embeddings in Vector DB]
    QASearch --> QAMatches{Matches > Threshold?}
    
    QAMatches -->|No| NoMatch[Create No-Match Eval: 'no_qa_match']
    QAMatches -->|Yes| SentenceMatch[Perform Sentence-Level Similarity Search]
    
    SentenceMatch --> AllMatched{All Sentences<br/>Matched?}
    
    AllMatched -->|No| Fallback[Run Fallback LLM Compare Agent]
    AllMatched -->|Yes| CitationMatch[Validate Citation URL Match]
    
    Fallback --> FallbackPass{LLM Decides<br/>Pass?}
    FallbackPass -->|No| NoMatchSent[Create No-Match Eval: 'no_sentence_match']
    FallbackPass -->|Yes| CitationMatch
    
    CitationMatch --> CitValid{Source URL ==<br/>Expert URL?}
    
    CitValid -->|No| NoMatchCit[Create No-Match Eval: 'no_citation_match']
    CitValid -->|Yes| CreateEval[Create Record: Copy Expert Scores to AI Eval]
    
    NoMatch --> Save[Save to MongoDB]
    NoMatchSent --> Save
    NoMatchCit --> Save
    CreateEval --> Save
    
    Save --> End
```

## 4. Key Configurations

- **evalConcurrency**: Controlled by `config/eval.js` and `SettingsService`. Defaults to `numCPUs - 1`.
- **thresholds**: Defined in `evaluation.worker.js` for QA and Sentence similarity.
- **deploymentMode**:
  - `Vercel`: Synchronous execution (handles Lambdas).
  - `CDS`: Asynchronous execution via Piscina worker pool.
