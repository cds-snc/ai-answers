# AI Answers - Government of Canada AI Assistant

AI Answers is a specialized AI chat agent designed for Government of Canada websites. It provides highly accurate, brief answers to user questions about government services, programs, and information, with a single citation to an official government source or next step of their task. AI Answers is model-independent, with an innovative evaluation system that uses detailed human expert evaluations to fuel automated AI evaluations and accurate answers. An extensive Admin interface supports evaluation, metrics, user management, and logging views.

### System Documentation
- **[SYSTEM_CARD.md](SYSTEM_CARD.md)** - Complete system card with technical architecture, safety measures, evaluation framework, and governance details 
**Français** : [SYSTEM_CARD_FR.md](SYSTEM_CARD_FR.md)

### Developer Documentation
- **[docs/architecture/pipeline-architecture.md](docs/architecture/pipeline-architecture.md)** - Complete LangGraph architecture and step-by-step pipeline implementation

### Current Status
- **Environment**: Preparing for public pilot
- **Production**: https://ai-answers.alpha.canada.ca



### Quick Start
To start the application locally with a disposable in-memory database and pre-seeded data:

#### 1. Configure Environment Variables
Create a `.env` file in the project root with the following variables:

```bash
# Required for Azure OpenAI (default provider)
AZURE_OPENAI_API_KEY=your_azure_openai_api_key      # Azure OpenAI service API key
AZURE_OPENAI_ENDPOINT=https://your-instance.openai.azure.com/  # Azure OpenAI endpoint URL
AZURE_OPENAI_API_VERSION=2024-06-01                 # Azure OpenAI API version

# Required for application security
JWT_SECRET_KEY=your_random_secret_key               # Secret key for JWT token signing

# Optional - Google Search (for context retrieval)
GOOGLE_API_KEY=your_google_api_key                  # Google Custom Search API key
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id       # Google Programmable Search Engine ID

# Optional - GC Notify (for 2FA and password reset emails)
GC_NOTIFY_API_KEY=your_gc_notify_api_key            # GC Notify API key for email notifications

# Development settings (usually left as-is)
NODE_ENV=development                                # Environment mode
USER_AGENT=testtest                               # User agent for web requests
DANGEROUSLY_DISABLE_HOST_CHECK=true                 # Allows React dev server to run
```

#### 2. Run the Quick Start Command
```bash
npm run dev:quick
```

This command will:
1. Start an in-memory MongoDB instance.
2. Seed it with default users:
   - Admin: `admin@admin.com` / `admin`
   - Partner: `partner@example.com` / `partner`
3. Start the backend (port 3001) and frontend (port 3000) with hot-reloading enabled.

**Note:** Data is not persistent and will reset when you stop the command.

