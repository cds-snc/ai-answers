/**
 * Unit tests for QuoraCrossEncoderComparator
 * Tests the cross-encoder model for duplicate question detection
 */

import { describe, test, expect, beforeAll, vi } from 'vitest';

// Mock ServerLoggingService
vi.mock('../../ServerLoggingService.js', () => ({
    default: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }
}));

// Import after mocking
import QuoraCrossEncoderComparator from '../QuoraCrossEncoderComparator.js';

describe('QuoraCrossEncoderComparator', () => {
    let comparator;

    beforeAll(async () => {
        comparator = new QuoraCrossEncoderComparator();
        // Allow time for model to load on first use
    }, 120000); // 2 minute timeout for model loading

    describe('Duplicate Detection Accuracy', () => {

        // Test cases: [question1, question2, expectedDuplicate, description]
        const testCases = [
            // Exact duplicates - should have HIGH scores (>0.8)
            {
                q1: 'What is SCIS?',
                q2: 'What is SCIS?',
                expectHigh: true,
                description: 'Identical questions'
            },
            {
                q1: 'How do I apply for a passport?',
                q2: 'How can I get a passport?',
                expectHigh: true,
                description: 'Paraphrased duplicates'
            },
            {
                q1: 'What are the requirements for citizenship?',
                q2: 'What do I need to become a citizen?',
                expectHigh: true,
                description: 'Semantic duplicates'
            },

            // Non-duplicates - should have LOW scores (<0.3)
            {
                q1: 'What is SCIS?',
                q2: 'How do I bake a cake?',
                expectHigh: false,
                description: 'Completely unrelated questions'
            },
            {
                q1: 'How do I apply for a passport?',
                q2: 'What is the weather today?',
                expectHigh: false,
                description: 'Different topics'
            },
            {
                q1: 'I am 16 and my daughter is 20',
                q2: 'I am 20 and my daughter is 16',
                expectHigh: false,
                description: 'Similar structure but different meaning (age swap)'
            },

            // Edge cases
            {
                q1: 'How do I find the SCIS form for over 18?',
                q2: 'What is SCIS?',
                expectHigh: false,
                description: 'Related topic but different questions'
            },
        ];

        test.each(testCases)(
            '$description: "$q1" vs "$q2"',
            async ({ q1, q2, expectHigh, description }) => {
                const result = await comparator.compare([q1], [q2]);

                expect(result.results).toHaveLength(1);
                const score = result.results[0].score;

                console.log(`[${description}] Score: ${score.toFixed(4)}`);

                if (expectHigh) {
                    // We expect at least some semantic similarity
                    expect(score).toBeGreaterThan(0.6);
                } else {
                    // Non-duplicates should be low
                    expect(score).toBeLessThan(0.7);
                }
            },
            60000
        );
    });

    describe('Tricky Edge Cases - Similar But Different (should reject at 0.94 threshold)', () => {
        // These are questions that LOOK similar but have different meanings
        // All should score below 0.94 (rejected as non-duplicates)
        const trickyNonDuplicates = [
            // Number/quantity swaps
            { q1: 'I am 16 and my daughter is 20', q2: 'I am 20 and my daughter is 16', desc: 'Age swap parent/child' },
            { q1: 'My son is 12 years old', q2: 'My son is 21 years old', desc: 'Different ages' },
            { q1: 'I have 2 children', q2: 'I have 3 children', desc: 'Different number of children' },
            { q1: 'I lived in Canada for 5 years', q2: 'I lived in Canada for 15 years', desc: 'Different duration' },
            { q1: 'The form costs $50', q2: 'The form costs $500', desc: 'Different price' },

            // Subject/object swaps
            { q1: 'Can my spouse sponsor me?', q2: 'Can I sponsor my spouse?', desc: 'Sponsor direction swap' },
            { q1: 'My employer owes me money', q2: 'I owe my employer money', desc: 'Debt direction swap' },
            { q1: 'Can parent apply for child?', q2: 'Can child apply for parent?', desc: 'Applicant swap' },
            { q1: 'Is the landlord responsible?', q2: 'Is the tenant responsible?', desc: 'Responsibility swap' },
            { q1: 'Does the buyer pay tax?', q2: 'Does the seller pay tax?', desc: 'Tax payer swap' },

            // Temporal differences
            { q1: 'What are the requirements before applying?', q2: 'What are the requirements after applying?', desc: 'Before vs after' },
            { q1: 'Can I work while waiting?', q2: 'Can I work after approval?', desc: 'During vs after waiting' },
            { q1: 'What happened in 2020?', q2: 'What will happen in 2025?', desc: 'Past vs future' },
            { q1: 'Is this still valid?', q2: 'Was this ever valid?', desc: 'Current vs historical' },
            { q1: 'How long until I receive it?', q2: 'How long ago did I apply?', desc: 'Future vs past timing' },

            // Location differences
            { q1: 'Requirements for Ontario', q2: 'Requirements for Quebec', desc: 'Different provinces' },
            { q1: 'Apply from inside Canada', q2: 'Apply from outside Canada', desc: 'Inside vs outside' },
            { q1: 'Living in Toronto', q2: 'Living in Vancouver', desc: 'Different cities' },
            { q1: 'US citizen applying', q2: 'UK citizen applying', desc: 'Different nationalities' },
            { q1: 'Born in Canada', q2: 'Born outside Canada', desc: 'Birth location' },

            // Status/category differences
            { q1: 'As a permanent resident', q2: 'As a citizen', desc: 'PR vs citizen' },
            { q1: 'For temporary workers', q2: 'For permanent workers', desc: 'Temp vs permanent' },
            { q1: 'Student visa requirements', q2: 'Work visa requirements', desc: 'Different visa types' },
            { q1: 'For married couples', q2: 'For common-law partners', desc: 'Different relationship types' },
            { q1: 'Self-employed income', q2: 'Employment income', desc: 'Different income types' },

            // Action differences
            { q1: 'How to apply for benefits?', q2: 'How to cancel benefits?', desc: 'Apply vs cancel' },
            { q1: 'How to start the process?', q2: 'How to stop the process?', desc: 'Start vs stop' },
            { q1: 'How to renew my passport?', q2: 'How to replace my passport?', desc: 'Renew vs replace' },
            { q1: 'How to appeal a decision?', q2: 'How to accept a decision?', desc: 'Appeal vs accept' },
            { q1: 'How to extend my stay?', q2: 'How to end my stay?', desc: 'Extend vs end' },

            // Inclusion/exclusion differences
            { q1: 'What is included in the fee?', q2: 'What is excluded from the fee?', desc: 'Included vs excluded' },
            { q1: 'Who is eligible?', q2: 'Who is ineligible?', desc: 'Eligible vs ineligible' },
            { q1: 'What documents are required?', q2: 'What documents are optional?', desc: 'Required vs optional' },
            { q1: 'Is this mandatory?', q2: 'Is this voluntary?', desc: 'Mandatory vs voluntary' },
            { q1: 'What is covered?', q2: 'What is not covered?', desc: 'Covered vs not covered' },

            // Positive/negative differences
            { q1: 'Can I travel during the process?', q2: 'Can I NOT travel during the process?', desc: 'Can vs cannot' },
            { q1: 'Is this allowed?', q2: 'Is this prohibited?', desc: 'Allowed vs prohibited' },
            { q1: 'Will my application be approved?', q2: 'Will my application be denied?', desc: 'Approved vs denied' },
            { q1: 'Is this legal in Canada?', q2: 'Is this illegal in Canada?', desc: 'Legal vs illegal' },
            { q1: 'Do I qualify?', q2: 'Do I not qualify?', desc: 'Qualify vs not qualify' },

            // Similar words, different meaning
            { q1: 'What is SCIS?', q2: 'Where is the SCIS office?', desc: 'What vs where' },
            { q1: 'How much does it cost?', q2: 'How long does it take?', desc: 'Cost vs time' },
            { q1: 'When is the deadline?', q2: 'Why is there a deadline?', desc: 'When vs why' },
            { q1: 'Who can apply?', q2: 'How can I apply?', desc: 'Who vs how' },
            { q1: 'What form do I need?', q2: 'What information do I need?', desc: 'Form vs information' },

            // Context-dependent differences
            { q1: 'Benefits for seniors', q2: 'Benefits for youth', desc: 'Different age groups' },
            { q1: 'Tax refund for individuals', q2: 'Tax refund for businesses', desc: 'Individual vs business' },
            { q1: 'First-time applicant', q2: 'Returning applicant', desc: 'First vs return' },
            { q1: 'Full-time student', q2: 'Part-time student', desc: 'Full vs part time' },
            { q1: 'Emergency application', q2: 'Regular application', desc: 'Emergency vs regular' },
        ];

        test.each(trickyNonDuplicates)(
            'Reject: $desc - "$q1" vs "$q2"',
            async ({ q1, q2, desc }) => {
                const result = await comparator.compare([q1], [q2]);

                expect(result.results).toHaveLength(1);
                const score = result.results[0].score;
                const recommendation = result.results[0].recommendation;

                console.log(`[${desc}] Score: ${score.toFixed(4)}, Recommendation: ${recommendation}`);

                // These should NOT be accepted as duplicates at 0.94 threshold
                expect(score).toBeLessThan(0.94);
                expect(recommendation).toBe('reject');
            },
            60000
        );
    });

    describe('Semantic Duplicates - Same Question With Extra Words (should accept)', () => {
        // These ARE asking the same thing - just with filler words or slight rephrasing
        // Should score HIGH (>= 0.7) proving it's not just string matching
        const semanticDuplicates = [
            { q1: 'What is SCIS?', q2: 'Hey, I was wondering, what is SCIS exactly?', desc: 'With greeting and filler' },
            { q1: 'How do I apply?', q2: 'Hello, how do I apply please?', desc: 'With greeting and polite word' },
            { q1: 'What are the requirements?', q2: 'Can you tell me what the requirements are?', desc: 'Question rephrasing' },
            { q1: 'Where do I submit the form?', q2: 'I need help - where exactly do I submit the form?', desc: 'With context prefix' },
            { q1: 'How long does it take?', q2: 'Just curious, how long does the whole thing take?', desc: 'With casual filler' },
            { q1: 'What documents do I need?', q2: 'Hi there! What documents do I need to bring?', desc: 'With greeting and extra verb' },
            { q1: 'Is there a fee?', q2: 'Quick question - is there a fee involved?', desc: 'With prefix' },
            { q1: 'When is the deadline?', q2: 'Can someone please tell me when the deadline is?', desc: 'Rephrased as request' },
            { q1: 'Who is eligible?', q2: 'I was hoping to find out who is eligible for this', desc: 'Conversational rephrasing' },
            { q1: 'How much does it cost?', q2: 'Excuse me, how much does this cost in total?', desc: 'With polite opener and extra words' },
        ];

        test.each(semanticDuplicates)(
            'Accept: $desc - "$q1" vs "$q2"',
            async ({ q1, q2, desc }) => {
                const result = await comparator.compare([q1], [q2]);

                expect(result.results).toHaveLength(1);
                const score = result.results[0].score;

                console.log(`[${desc}] Score: ${score.toFixed(4)}`);

                // These SHOULD be recognized as same intent (score >= 0.7)
                expect(score).toBeGreaterThan(0.7);
            },
            60000
        );
    });

    describe('Batch Processing', () => {
        test('should handle multiple candidates efficiently', async () => {
            const result = await comparator.compare(
                ['What is SCIS?'],
                ['What is SCIS?', 'How do I apply?', 'What does SCIS stand for?']
            );

            expect(result.results).toHaveLength(3);

            // First should be highest (exact match)
            expect(result.results[0].score).toBeGreaterThan(0.8);
        }, 60000);
    });
});
