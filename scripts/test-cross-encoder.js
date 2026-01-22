/**
 * Test script for the LocalCrossEncoderComparator
 * 
 * Run with: node scripts/test-cross-encoder.js
 * 
 * Set LOCAL_CROSSENCODER_MODEL env var to test different models:
 *   - Xenova/all-MiniLM-L6-v2 (default, ~23MB, public)
 *   - Xenova/quora-distilroberta-base (~82MB, may require HF auth)
 *   - Xenova/paraphrase-MiniLM-L6-v2 (~80MB, paraphrase detection)
 */

import { LocalCrossEncoderComparator } from '../services/comparators/LocalCrossEncoderComparator.js';

const testCases = [
    {
        name: 'Exact duplicate',
        user: ['How do I apply for EI?'],
        candidates: ['How do I apply for EI?'],
        expected: 'accept',
        description: 'Identical questions should match'
    },
    {
        name: 'Simple paraphrase',
        user: ['How do I apply for EI?'],
        candidates: ['How can I submit an Employment Insurance application?'],
        expected: 'accept',
        description: 'Same intent, different wording'
    },
    {
        name: 'Negation difference',
        user: ['How do I apply for EI?'],
        candidates: ['How do I cancel my EI application?'],
        expected: 'reject',
        description: 'Negation should NOT match (apply vs cancel)'
    },
    {
        name: 'Entity swap - passport vs license',
        user: ['How do I renew my passport?'],
        candidates: ["How do I renew my driver's license?"],
        expected: 'reject',
        description: 'Different entities should NOT match'
    },
    {
        name: 'Entity swap - CRA vs Service Canada',
        user: ['How do I contact CRA?'],
        candidates: ['How do I contact Service Canada?'],
        expected: 'reject',
        description: 'Different government departments should NOT match'
    },
    {
        name: 'Multi-turn conversation flow',
        user: ['What is EI?', 'How do I apply?'],
        candidates: ['What is Employment Insurance?\n\nHow can I submit an application?'],
        expected: 'accept',
        description: 'Multi-question flows with same intent'
    },
    {
        name: 'Similar topic, different action',
        user: ['How do I check my EI status?'],
        candidates: ['How do I apply for EI benefits?'],
        expected: 'reject',
        description: 'Same topic but different action (check vs apply)'
    },
    {
        name: 'Greeting vs question',
        user: ['Hello, how are you?'],
        candidates: ['How do I apply for EI?'],
        expected: 'reject',
        description: 'Greeting should not match EI question'
    },
    {
        name: 'Synonym usage - tax return',
        user: ['How do I file my taxes?'],
        candidates: ['How can I submit my tax return?'],
        expected: 'accept',
        description: 'Synonyms should match'
    },
    {
        name: 'Question about eligibility',
        user: ['Am I eligible for EI?'],
        candidates: ['How do I apply for EI?'],
        expected: 'reject',
        description: 'Eligibility vs application are different intents'
    }
];

async function runTests() {
    const modelName = process.env.LOCAL_CROSSENCODER_MODEL || 'Xenova/all-MiniLM-L6-v2';
    const threshold = parseFloat(process.env.LOCAL_CROSSENCODER_THRESHOLD) || 0.75;

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     LocalCrossEncoderComparator Test Suite                    ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  Model: ${modelName.padEnd(52)}║`);
    console.log(`║  Threshold: ${threshold}                                              ║`.slice(0, 66) + '║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const comparator = new LocalCrossEncoderComparator({ threshold });

    let passed = 0;
    let failed = 0;
    const results = [];
    let lastResult = null;

    console.log('Loading model (first run may take a few seconds)...\n');

    for (const tc of testCases) {
        const startTime = Date.now();
        const result = await comparator.compare(tc.user, tc.candidates);
        lastResult = result;
        const latency = Date.now() - startTime;

        // Handle case where model failed to load
        if (!result.results || result.results.length === 0) {
            console.log(`❌ ${tc.name}`);
            console.log(`   Model error: ${result.metadata?.error || 'No results returned'}`);
            console.log();
            failed++;
            results.push({ name: tc.name, pass: false, score: 0, expected: tc.expected, actual: 'error', latency });
            continue;
        }

        const topResult = result.results[0];
        const pass = topResult.recommendation === tc.expected;

        if (pass) passed++;
        else failed++;

        const statusIcon = pass ? '✅' : '❌';
        const scoreBar = '█'.repeat(Math.round(topResult.score * 10)) + '░'.repeat(10 - Math.round(topResult.score * 10));

        console.log(`${statusIcon} ${tc.name}`);
        console.log(`   ${tc.description}`);
        console.log(`   User:      "${tc.user.join(' → ')}"`);
        console.log(`   Candidate: "${tc.candidates[0].substring(0, 50)}${tc.candidates[0].length > 50 ? '...' : ''}"`);
        console.log(`   Score:     [${scoreBar}] ${(topResult.score * 100).toFixed(1)}%`);
        console.log(`   Result:    ${topResult.recommendation.toUpperCase()} (expected: ${tc.expected.toUpperCase()})`);
        console.log(`   Latency:   ${latency}ms`);
        console.log();

        results.push({
            name: tc.name,
            pass,
            score: topResult.score,
            expected: tc.expected,
            actual: topResult.recommendation,
            latency
        });
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`\n📊 Results: ${passed}/${testCases.length} passed (${((passed / testCases.length) * 100).toFixed(0)}%)`);

    if (failed > 0) {
        console.log('\n⚠️  Failed tests:');
        results.filter(r => !r.pass).forEach(r => {
            console.log(`   - ${r.name}: got ${r.actual} (score: ${(r.score * 100).toFixed(1)}%), expected ${r.expected}`);
        });
    }

    const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / results.length;
    console.log(`\n⏱️  Average latency: ${avgLatency.toFixed(0)}ms per comparison`);
    console.log(`   Model: ${lastResult?.metadata?.model || modelName}`);
}

runTests().catch(err => {
    console.error('Test failed with error:', err);
    process.exit(1);
});
