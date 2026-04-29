import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const ALL_CHAPTERS = [
  { subject: 'Add Maths', form: 4, ch: 1, topic: 'Functions', sub: 'Functions, composite functions, inverse functions, domain, range, image' },
  { subject: 'Add Maths', form: 4, ch: 2, topic: 'Quadratic Functions', sub: 'Quadratic equations, inequalities, types of roots, discriminant, graph sketching' },
  { subject: 'Add Maths', form: 4, ch: 3, topic: 'Systems of Equations', sub: 'Linear equations in three variables, simultaneous equations one linear one non-linear' },
  { subject: 'Add Maths', form: 4, ch: 4, topic: 'Indices Surds and Logarithms', sub: 'Laws of indices, surds, rationalising denominators, laws of logarithms, change of base' },
  { subject: 'Add Maths', form: 4, ch: 5, topic: 'Progressions', sub: 'Arithmetic progression nth term sum, geometric progression nth term sum, sum to infinity' },
  { subject: 'Add Maths', form: 4, ch: 6, topic: 'Linear Law', sub: 'Linear and non-linear relations, lines of best fit, applying linear law to non-linear relations' },
  { subject: 'Add Maths', form: 4, ch: 7, topic: 'Coordinate Geometry', sub: 'Divisor of line segment, parallel perpendicular lines, area of polygons, loci equations' },
  { subject: 'Add Maths', form: 4, ch: 8, topic: 'Vectors', sub: 'Vectors scalars, vector notation, scalar multiplication, parallel vectors, resultant vectors, unit vectors' },
  { subject: 'Add Maths', form: 4, ch: 9, topic: 'Solution of Triangles', sub: 'Sine rule, ambiguous case, cosine rule, area of triangles, Herons formula' },
  { subject: 'Add Maths', form: 4, ch: 10, topic: 'Index Numbers', sub: 'Index numbers, composite index, weightage, solving index number problems' },
  { subject: 'Chemistry', form: 5, ch: 1, topic: 'Redox Equilibrium', sub: 'Oxidation and reduction, standard electrode potential, electrochemical cells, electrolysis, extraction of metals, rusting' },
  { subject: 'Chemistry', form: 5, ch: 2, topic: 'Carbon Compounds', sub: 'Types of carbon compounds, homologous series, alkanes alkenes alcohols carboxylic acids esters, organic reactions' },
  { subject: 'Chemistry', form: 5, ch: 3, topic: 'Thermochemistry', sub: 'Exothermic endothermic reactions, heat of precipitation neutralisation combustion, Hess law' },
  { subject: 'Chemistry', form: 5, ch: 4, topic: 'Polymers', sub: 'Natural synthetic polymers, addition condensation polymerisation, plastics rubber proteins' },
  { subject: 'Chemistry', form: 5, ch: 5, topic: 'Consumer and Industrial Chemistry', sub: 'Medicines, food additives, cosmetics, industrial chemicals, manufactured fertilisers, alloys' },
];

async function gen(prompt) {
  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-5', max_tokens: 800,
    messages: [{ role: 'user', content: prompt }]
  });
  return r.content[0].text.trim();
}

async function main() {
  for (const c of ALL_CHAPTERS) {
    // Check if already exists
    const { data: existing } = await supabase.from('lessons')
      .select('id').eq('subject', c.subject).eq('topic', c.topic).maybeSingle();
    if (existing) { console.log('Skip (exists): ' + c.subject + ' Ch' + c.ch + ' ' + c.topic); continue; }

    console.log('Generating: ' + c.subject + ' Ch' + c.ch + ' ' + c.topic + '...');
    const base = 'SPM ' + c.subject + ' Form ' + c.form + ' Chapter ' + c.ch + ': ' + c.topic + ' (' + c.sub + '). ';
    try {
      const intro  = await gen(base + 'Write 2 warm paragraphs introducing this topic for SPM students. Plain text only.');
      const body   = await gen(base + 'Explain all key concepts and formulas clearly with examples. 300 words. Plain text only.');
      const ex     = await gen(base + 'Write 2 fully worked SPM-style examples with complete step-by-step solutions. Plain text only.');
      const mis    = await gen(base + 'List 4 common mistakes students make in this topic with corrections. Plain text only.');
      const sum    = await gen(base + 'List all key formulas and important points to remember for SPM exam. Plain text only.');

      const { error } = await supabase.from('lessons').insert({
        subject: c.subject, title: 'Chapter ' + c.ch + ': ' + c.topic,
        topic: c.topic, form_level: c.form, chapter_number: c.ch, status: 'published',
        introduction: intro, content: body, worked_examples: ex, common_mistakes: mis, summary: sum,
      });
      if (error) console.log('  DB error:', error.message);
      else console.log('  Saved!');
    } catch(e) { console.log('  Error:', e.message); }
  }
  console.log('All done!');
}
main();
