
import QuoraCrossEncoderComparator from '../QuoraCrossEncoderComparator.js';

async function runReport() {
    const comparator = new QuoraCrossEncoderComparator();

    const tests = [
        { group: 'BENCHMARK', q1: 'What is SCIS?', q2: 'What is SCIS?', desc: 'Identical' },

        { group: 'CONVERSATIONAL FILLER (STRICTNESS TEST)', q1: 'What is SCIS?', q2: 'What is SCIS please?', desc: '+1 word (please)' },
        { group: 'CONVERSATIONAL FILLER (STRICTNESS TEST)', q1: 'What is SCIS?', q2: 'What is SCIS exactly?', desc: '+1 word (exactly)' },
        { group: 'CONVERSATIONAL FILLER (STRICTNESS TEST)', q1: 'What is SCIS?', q2: 'Hey what is SCIS?', desc: '+1 word (Hey)' },
        { group: 'CONVERSATIONAL FILLER (STRICTNESS TEST)', q1: 'What is SCIS?', q2: 'Hey what is SCIS please?', desc: '+2 words (Hey...please)' },
        { group: 'CONVERSATIONAL FILLER (STRICTNESS TEST)', q1: 'What is SCIS?', q2: 'I was wondering what is SCIS?', desc: '+3 words (I was wondering)' },
        { group: 'CONVERSATIONAL FILLER (STRICTNESS TEST)', q1: 'What is SCIS?', q2: 'Can you tell me what is SCIS?', desc: '+4 words (Can you tell me)' },

        { group: 'ENTITY SWAPS (LOGIC TEST)', q1: 'Can I apply for my daughter?', q2: 'Can my daughter apply for me?', desc: 'Sponsor/Applicant swap' },
        { group: 'ENTITY SWAPS (LOGIC TEST)', q1: 'I need to help my daughter with SCIS', q2: 'My daughter needs to help me with SCIS', desc: 'Helper/Recipient swap' },
        { group: 'ENTITY SWAPS (LOGIC TEST)', q1: 'I am 16 and my daughter is 20', q2: 'I am 20 and my daughter is 16', desc: 'Age swap benchmark' },

        { group: 'TRICKY BUT DIFFERENT', q1: 'How do I find the form for over 18?', q2: 'How do I find the form for under 18?', desc: 'Over vs Under (1 word diff)' },
        { group: 'TRICKY BUT DIFFERENT', q1: 'Apply from inside Canada', q2: 'Apply from outside Canada', desc: 'Inside vs Outside (1 word diff)' },
    ];

    console.log('\n--- QUORA MODEL STRESS TEST REPORT ---');
    console.log('Threshold: 0.94\n');

    let currentGroup = '';
    for (const test of tests) {
        if (test.group !== currentGroup) {
            currentGroup = test.group;
            console.log(`\n[${currentGroup}]`);
        }

        const result = await comparator.compare([test.q1], [test.q2]);
        const score = result.results[0].score;
        const status = score >= 0.94 ? 'MATCH' : 'REJECT';

        console.log(`${status.padEnd(7)} | Score: ${score.toFixed(4)} | ${test.desc.padEnd(25)} | "${test.q1}" vs "${test.q2}"`);
    }
    console.log('\n--------------------------------------\n');
}

runReport().catch(console.error);
