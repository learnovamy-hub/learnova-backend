import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CHAPTERS = [
  { ch: 3, topic: 'Integration', sub: 'Indefinite integrals, definite integrals, area under curve, volume of revolution' },
  { ch: 5, topic: 'Probability Distribution', sub: 'Random variables, binomial distribution, normal distribution, Z-score' },
  { ch: 7, topic: 'Linear Programming', sub: 'Linear inequalities, feasible region, objective function, optimisation' },
  { ch: 8, topic: 'Kinematics of Linear Motion', sub: 'Displacement, velocity, acceleration, differentiation and integration in kinematics' },
];

async function gen(prompt) {
  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-5', max_tokens: 800,
    messages: [{ role: 'user', content: prompt }]
  });
  return r.content[0].text.trim();
}

async function main() {
  for (const c of CHAPTERS) {
    console.log('Ch' + c.ch + ': ' + c.topic);
    const base = 'SPM Add Maths Form 5 ' + c.topic + ' (' + c.sub + '). ';
    try {
      const intro  = await gen(base + 'Write 2 warm paragraphs introducing this topic for SPM students. Plain text.');
      const body   = await gen(base + 'Explain the key concepts and formulas clearly. 250 words. Plain text.');
      const ex     = await gen(base + 'Give 2 worked SPM examples with full solutions. Plain text.');
      const mis    = await gen(base + 'List 4 common mistakes students make with corrections. Plain text.');
      const sum    = await gen(base + 'List key formulas to remember for SPM exam. Plain text.');

      const { error } = await supabase.from('lessons').insert({
        subject: 'Add Maths', title: 'Chapter ' + c.ch + ': ' + c.topic,
        topic: c.topic, form_level: 5, chapter_number: c.ch, status: 'published',
        introduction: intro, content: body,
        worked_examples: ex, common_mistakes: mis, summary: sum,
      });
      if (error) console.log('  DB error:', error.message);
      else console.log('  Saved!');
    } catch(e) { console.log('  Error:', e.message); }
  }
  console.log('Done!');
}
main();
