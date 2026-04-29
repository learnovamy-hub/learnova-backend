import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ALL_CHAPTERS = [
  { subject: 'Biology', form: 5, ch: 1, topic: 'Transport', sub: 'Blood, heart, lymphatic system, plant transport, transpiration' },
  { subject: 'Biology', form: 5, ch: 2, topic: 'Immunity', sub: 'Pathogens, immune response, antibodies, vaccines, HIV' },
  { subject: 'Biology', form: 5, ch: 3, topic: 'Excretion', sub: 'Kidneys, nephron, urine formation, osmoregulation, liver' },
  { subject: 'Biology', form: 5, ch: 4, topic: 'Inheritance', sub: 'Mendels laws, monohybrid dihybrid crosses, mutation, genetic disorders' },
  { subject: 'Biology', form: 5, ch: 5, topic: 'Variation', sub: 'Continuous discontinuous variation, natural selection, evolution' },
  { subject: 'Chemistry', form: 4, ch: 1, topic: 'Introduction to Chemistry', sub: 'Scientific method, matter, separation techniques' },
  { subject: 'Chemistry', form: 4, ch: 2, topic: 'Structure of Atom', sub: 'Atomic structure, isotopes, electron arrangement, periodic table' },
  { subject: 'Chemistry', form: 4, ch: 3, topic: 'Chemical Formulae and Equations', sub: 'Valency, mole concept, chemical equations, stoichiometry' },
  { subject: 'Chemistry', form: 4, ch: 4, topic: 'Periodic Table', sub: 'Groups periods trends, alkali metals, halogens, transition metals' },
  { subject: 'Chemistry', form: 4, ch: 5, topic: 'Chemical Bonds', sub: 'Ionic covalent metallic bonds, properties of compounds' },
  { subject: 'Chemistry', form: 4, ch: 6, topic: 'Electrochemistry', sub: 'Electrolytes, electrolysis, electroplating, purification of metals' },
  { subject: 'Chemistry', form: 4, ch: 7, topic: 'Acids Bases and Salts', sub: 'pH scale, neutralisation, salt preparation, titration' },
  { subject: 'Chemistry', form: 4, ch: 8, topic: 'Manufactured Substances', sub: 'Alloys, glass, polymers, composites, industrial chemistry' },
  { subject: 'Physics', form: 5, ch: 1, topic: 'Forces and Motion II', sub: 'Resultant force, collisions, conservation of momentum' },
  { subject: 'Physics', form: 5, ch: 2, topic: 'Pressure', sub: 'Liquid pressure, Pascals principle, Archimedes, Bernoulli' },
  { subject: 'Physics', form: 5, ch: 3, topic: 'Electricity', sub: 'Current, voltage, resistance, Ohms law, circuits, power' },
  { subject: 'Physics', form: 5, ch: 4, topic: 'Electromagnetism', sub: 'Magnetic field, induction, transformers, generators, motors' },
  { subject: 'Physics', form: 5, ch: 5, topic: 'Electronics', sub: 'Semiconductors, diodes, transistors, logic gates' },
  { subject: 'Physics', form: 5, ch: 6, topic: 'Nuclear Physics', sub: 'Radioactivity, half life, fission, fusion, nuclear energy' },
];
async function gen(p) { const r = await anthropic.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 800, messages: [{ role: 'user', content: p }] }); return r.content[0].text.trim(); }
async function main() {
  for (const c of ALL_CHAPTERS) {
    const { data: ex } = await supabase.from('lessons').select('id').eq('subject', c.subject).eq('topic', c.topic).maybeSingle();
    if (ex) { console.log('Skip: ' + c.subject + ' F' + c.form + ' ' + c.topic); continue; }
    console.log('Gen: ' + c.subject + ' F' + c.form + ' Ch' + c.ch + ' ' + c.topic);
    const b = 'SPM ' + c.subject + ' Form ' + c.form + ' Ch' + c.ch + ': ' + c.topic + ' (' + c.sub + '). ';
    try {
      const intro = await gen(b + 'Write 2 warm intro paragraphs for SPM students. Plain text.');
      const body  = await gen(b + 'Explain all key concepts and formulas. 300 words. Plain text.');
      const ex2   = await gen(b + 'Write 2 worked SPM examples with solutions. Plain text.');
      const mis   = await gen(b + 'List 4 common mistakes with corrections. Plain text.');
      const sum   = await gen(b + 'List key formulas for SPM exam. Plain text.');
      const { error } = await supabase.from('lessons').insert({ subject: c.subject, title: 'Ch' + c.ch + ': ' + c.topic, topic: c.topic, form_level: c.form, chapter_number: c.ch, status: 'published', introduction: intro, content: body, worked_examples: ex2, common_mistakes: mis, summary: sum });
      if (error) console.log('  DB err:', error.message); else console.log('  Saved!');
    } catch(e) { console.log('  Err:', e.message); }
  }
  console.log('Done!');
}
main();
