// Server-side answer parsing service
// Mirrors the parsing logic from src/services/AnswerService.js

export function parseSentences(text) {
    const sentenceRegex = /<s-(\d+)>(.*?)<\/s-\d+>/g;
    const sentences = [];
    let match;

    while ((match = sentenceRegex.exec(text)) !== null) {
        const index = parseInt(match[1]) - 1;
        if (index >= 0 && index < 4 && match[2].trim()) {
            sentences[index] = match[2].trim();
        }
    }

    // If no sentence tags found, treat entire text as first sentence
    if (sentences.length === 0 && text.trim()) {
        sentences[0] = text.trim();
    }

    return Array(4)
        .fill('')
        .map((_, i) => sentences[i] || '');
}

export function parseResponse(text) {
    if (!text) {
        return {
            answerType: 'normal',
            content: '',
            preliminaryChecks: null,
            englishAnswer: null,
            citationHead: null,
            citationUrl: null,
            paragraphs: [],
            confidenceRating: null,
            sentences: parseSentences(''),
        };
    }

    let answerType = 'normal';
    let content = text;
    let preliminaryChecks = null;
    let englishAnswer = null;
    let citationHead = null;
    let citationUrl = null;
    let confidenceRating = null;

    const preliminaryMatch = /<preliminary-checks>([\s\S]*?)<\/preliminary-checks>/s.exec(text);
    if (preliminaryMatch) {
        preliminaryChecks = preliminaryMatch[1].trim();
        content = content.replace(/<preliminary-checks>[\s\S]*?<\/preliminary-checks>/s, '').trim();
    }

    // Extract citation information before processing answers
    const citationHeadMatch = /<citation-head>(.*?)<\/citation-head>/s.exec(content);
    const citationUrlMatch = /<citation-url>(.*?)<\/citation-url>/s.exec(content);

    if (citationHeadMatch) {
        citationHead = citationHeadMatch[1].trim();
    }
    if (citationUrlMatch) {
        citationUrl = citationUrlMatch[1].trim();
    }

    // Extract English answer first
    const englishMatch = /<english-answer>([\s\S]*?)<\/english-answer>/s.exec(content);
    if (englishMatch) {
        englishAnswer = englishMatch[1].trim();
        content = englishAnswer;  // Use English answer as content for English questions
    }

    // Extract main answer if it exists
    const answerMatch = /<answer>([\s\S]*?)<\/answer>/s.exec(text);
    if (answerMatch) {
        content = answerMatch[1].trim();
    }
    content = content.replace(/<citation-head>[\s\S]*?<\/citation-head>/s, '').trim();
    content = content.replace(/<citation-url>[\s\S]*?<\/citation-url>/s, '').trim();
    content = content.replace(/<confidence>(.*?)<\/confidence>/s, '').trim();

    // Check for special tags in either english-answer or answer content
    const specialTags = {
        'not-gc': /<not-gc>([\s\S]*?)<\/not-gc>/,
        'pt-muni': /<pt-muni>([\s\S]*?)<\/pt-muni>/,
        'clarifying-question': /<clarifying-question>([\s\S]*?)<\/clarifying-question>/
    };

    // Check each special tag type and extract their content
    for (const [type, regex] of Object.entries(specialTags)) {
        const englishTagMatch = englishAnswer && regex.exec(englishAnswer);
        const contentTagMatch = content && regex.exec(content);

        if (englishTagMatch || contentTagMatch) {
            answerType = type;
            if (englishTagMatch) {
                englishAnswer = englishTagMatch[1].trim();
            }
            if (contentTagMatch) {
                content = contentTagMatch[1].trim();
            }
            break;
        }
    }

    // Special-case: if the English answer explicitly states no answer was found
    // on Government of Canada websites, force the answerType to 'not-gc'.
    if (
        englishAnswer &&
        englishAnswer.includes("An answer to your question wasn't found on Government of Canada websites.")
    ) {
        answerType = 'not-gc';
    }

    const confidenceRatingRegex = /<confidence>(.*?)<\/confidence>/s;
    const confidenceMatch = text.match(confidenceRatingRegex);

    if (confidenceMatch) {
        confidenceRating = confidenceMatch[1].trim();
    }

    const paragraphs = content.split(/\n+/).map(paragraph => paragraph.trim()).filter(paragraph => paragraph !== '');
    const sentences = parseSentences(content);

    const result = {
        answerType,
        content,
        preliminaryChecks,
        englishAnswer,
        citationHead,
        citationUrl,
        paragraphs,
        confidenceRating,
        sentences,
    };

    return result;
}
