
import { describe, test } from 'vitest';
import QuoraCrossEncoderComparator from '../QuoraCrossEncoderComparator.js';
import fs from 'fs';

describe('Quora Model Stress Test', () => {
    test('Pinpoint strictness and logic', async () => {
        const comparator = new QuoraCrossEncoderComparator();

        const tests = [
            { group: 'BENCHMARK', q1: 'What is SCIS?', q2: 'What is SCIS?', desc: 'Identical' },

            { group: 'FILLERS', q1: 'What is SCIS?', q2: 'What is SCIS please?', desc: '+1 word (please)' },
            { group: 'FILLERS', q1: 'What is SCIS?', q2: 'What is SCIS exactly?', desc: '+1 word (exactly)' },
            { group: 'FILLERS', q1: 'What is SCIS?', q2: 'Hey what is SCIS?', desc: '+1 word (Hey)' },
            { group: 'FILLERS', q1: 'What is SCIS?', q2: 'Hey what is SCIS please?', desc: '+2 words (Hey...please)' },
            { group: 'FILLERS', q1: 'What is SCIS?', q2: 'I was wondering what is SCIS?', desc: '+3 words (I was wondering)' },
            { group: 'FILLERS', q1: 'What is SCIS?', q2: 'Can you tell me what is SCIS?', desc: '+4 words (Can you tell me)' },

            { group: 'ENTITY SWAPS', q1: 'Can I apply for my daughter?', q2: 'Can my daughter apply for me?', desc: 'Sponsor/Applicant swap' },
            { group: 'ENTITY SWAPS', q1: 'I need to help my daughter with SCIS', q2: 'My daughter needs to help me with SCIS', desc: 'Helper/Recipient swap' },
            { group: 'ENTITY SWAPS', q1: 'I am 16 and my daughter is 20', q2: 'I am 20 and my daughter is 16', desc: 'Age swap benchmark' },

            { group: 'TRICKY', q1: 'How do I find the form for over 18?', q2: 'How do I find the form for under 18?', desc: 'Over vs Under (1 word diff)' },
            { group: 'TRICKY', q1: 'Apply from inside Canada', q2: 'Apply from outside Canada', desc: 'Inside vs Outside (1 word diff)' },
        ];

        let output = '--- QUORA MODEL STRESS TEST REPORT ---\n';
        output += 'Threshold: 0.94\n\n';

        for (const t of tests) {
            const result = await comparator.compare([t.q1], [t.q2]);
            const score = result.results[0].score;
            const status = score >= 0.94 ? 'MATCH' : 'REJECT';
            output += `${status.padEnd(7)} | Score: ${score.toFixed(4)} | ${t.desc.padEnd(25)} | "${t.q1}" vs "${t.q2}"\n`;
        }

        fs.writeFileSync('model_stress_test.txt', output);
        console.log('Report written to model_stress_test.txt');
    }, 120000);
});
