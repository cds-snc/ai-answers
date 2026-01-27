# Claude Code Instructions

## Documentation Regeneration

When any file in `agents/prompts/` is changed (except department scenarios in `agents/prompts/scenarios/context-*/`), regenerate the system prompt documentation:

```bash
node scripts/generate-system-prompt-documentation.js
```

This keeps `docs/agents-prompts/system-prompt-documentation.md` in sync with the actual prompts.

## Official languages 
Locales files in src/locales have matching EN and FR versions of ui messages - make sure to suggest changing fr.json if changes are made to en.json

About page is different - text content is in .md files
 *   - English: public/content/about-en.md
 *   - French:  public/content/about-fr.md
