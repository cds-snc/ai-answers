import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildSystemCardMarkdown } from '../systemCardMarkdown.js';
import { parseFrontmatter } from '../markdownFrontmatter.js';
import { SYSTEM_CARD_FILES } from '../../config/systemCard.js';

const CARD = `# AI Answers system card

**Version**: 1.3

**Français** : [SYSTEM_CARD_FR.md](SYSTEM_CARD_FR.md)

## On this page
- [Executive summary](#executive-summary)

![Diagram](docs/images/system_diagram_v2_EN.jpg)

See [the partner list](src/constants/partnerDepartments.js), [a PDF](docs/pdf/short-ai-answers-en.pdf),
[the pipeline](docs/architecture/pipeline-architecture.md#nodes) and [the blog](https://blog.canada.ca/x.html).
`;

describe('buildSystemCardMarkdown', () => {
  const build = (source, options = {}) =>
    buildSystemCardMarkdown(source, { lang: 'en', description: '', assetExists: () => true, ...options });
  const { markdown, assets } = build(CARD, { description: 'A "quoted" description' });
  const { frontmatter, contentBody } = parseFrontmatter(markdown);

  it('adds frontmatter with the card title and the given description', () => {
    expect(frontmatter.title).toBe('AI Answers system card');
    expect(frontmatter.description).toBe('A "quoted" description');
  });

  it('drops the other-language GitHub link line', () => {
    expect(contentBody).not.toContain('SYSTEM_CARD_FR.md');
    expect(contentBody).toContain('**Version**: 1.3');
  });

  it('serves images and PDFs from the app', () => {
    expect(contentBody).toContain('![Diagram](/content/system-card/docs/images/system_diagram_v2_EN.jpg)');
    expect(contentBody).toContain('[a PDF](/content/system-card/docs/pdf/short-ai-answers-en.pdf)');
    expect(assets).toEqual(['docs/images/system_diagram_v2_EN.jpg', 'docs/pdf/short-ai-answers-en.pdf']);
  });

  it('points other repo files at GitHub, keeping any #anchor', () => {
    expect(contentBody).toContain(
      '[the partner list](https://github.com/cds-snc/ai-answers/blob/main/src/constants/partnerDepartments.js)'
    );
    expect(contentBody).toContain(
      '[the pipeline](https://github.com/cds-snc/ai-answers/blob/main/docs/architecture/pipeline-architecture.md#nodes)'
    );
  });

  it('leaves in-page anchors and external links alone', () => {
    expect(contentBody).toContain('[Executive summary](#executive-summary)');
    expect(contentBody).toContain('[the blog](https://blog.canada.ca/x.html)');
  });

  it('falls back to the standard page title when the card has none', () => {
    const fr = parseFrontmatter(build('no title here', { lang: 'fr' }).markdown);
    expect(fr.frontmatter.title).toBe('Fiche système Réponses IA');
  });

  it('shows a missing image or PDF as unavailable text, in the page language, instead of failing', () => {
    const missing = build(CARD, { lang: 'fr', assetExists: () => false });
    const body = parseFrontmatter(missing.markdown).contentBody;
    expect(body).toContain('*Image non disponible (Diagram)*');
    expect(body).toContain('a PDF *(PDF non disponible)*');
    expect(body).not.toContain('/content/system-card/');
    expect(missing.assets).toEqual([]);
    expect(missing.missingAssets).toEqual(['docs/images/system_diagram_v2_EN.jpg', 'docs/pdf/short-ai-answers-en.pdf']);
  });

  it('treats a ../ image or PDF as unavailable, since serving it would fail the build', () => {
    const outside = build('# T\n\n[a PDF](../secret.pdf) ![pic](docs/../../x.png)', { assetExists: () => true });
    const body = parseFrontmatter(outside.markdown).contentBody;
    expect(body).toContain('a PDF *(PDF unavailable)*');
    expect(body).toContain('*Image unavailable (pic)*');
    expect(outside.assets).toEqual([]);
  });

  // The real cards: the build only warns about a missing linked file (the
  // page shows it as unavailable), so this is what catches it in the PR.
  it.each(Object.entries(SYSTEM_CARD_FILES))('the %s card links only files that exist', (lang, { source }) => {
    const { assets: realAssets, missingAssets } = build(fs.readFileSync(path.resolve(source), 'utf8'), {
      lang,
      assetExists: (repoPath) => fs.existsSync(path.resolve(repoPath)),
    });
    expect(realAssets.length).toBeGreaterThan(0);
    expect(missingAssets).toEqual([]);
  });
});
