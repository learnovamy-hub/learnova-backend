import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const ALL_CHAPTERS = [
  { subject: 'Physics', form: 4, ch: 1, topic: 'Measurement', sub: 'Physical quantities, SI units, scalar and vector, scientific investigation, measurement instruments, errors' },
  { subject: 'Physics', form: 4, ch: 2, topic: 'Forces and Motion I', sub: 'Linear motion, velocity acceleration graphs, free fall, inertia, momentum, force, impulse, weight' },
  { subject: 'Physics', form: 4, ch: 3, topic: 'Gravitation', sub: 'Newtons law of gravitation, gravitational field, satellite motion, escape velocity, Keplers laws' },
  { subject: 'Physics', form: 4, ch: 4, topic: 'Heat', sub: 'Thermal equilibrium, specific heat capacity, specific latent heat, gas laws, ideal gas, thermodynamics' },
  { subject: 'Physics', form: 4, ch: 5, topic: 'Waves', sub: 'Wave properties, transverse longitudinal waves, reflection refraction diffraction interference, electromagnetic waves' },
  { subject: 'Physics', form: 4, ch: 6, topic: 'Light and Optics', sub: 'Reflection refraction, total internal reflection, lenses, optical instruments, eye defects' },
  { subject: 'Biology', form: 4, ch: 1, topic: 'Introduction to Biology', sub: 'Characteristics of living things, biology fields, scientific investigation, lab safety' },
  { subject: 'Biology', form: 4, ch: 2, topic: 'Cell Biology', sub: 'Cell structure, prokaryotic eukaryotic, cell organelles, cell membrane, osmosis diffusion, cell division' },
  { subject: 'Biology', form: 4, ch: 3, topic: 'Nutrition', sub: 'Nutrients, photosynthesis, human digestive system, absorption, malnutrition' },
  { subject: 'Biology', form: 4, ch: 4, topic: 'Respiration', sub: 'Aerobic anaerobic respiration, gaseous exchange, breathing mechanism, respiratory system' },
  { subject: 'Biology', form: 4, ch: 5, topic: 'Human Coordination', sub: 'Nervous system, neurons, reflex arc, endocrine system, hormones, homeostasis' },
  { subject: 'Biology', form: 4, ch: 6, topic: 'Support and Locomotion', sub: 'Skeleton, joints, muscles, movement in animals and plants, hydrostatic skeleton, exoskeleton' },
  { subject: 'Biology', form: 4, ch: 7, topic: 'Reproduction', sub: 'Asexual sexual reproduction, human reproductive system, menstrual cycle, fertilisation, pregnancy, birth' },
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
    const { data: existing } = await supabase.from('lessons')
      .select('id').eq('subject', c.subject).eq('topic', c.topic).maybeSingle();
    if (existing) { console.log('Skip: ' + c.subject + ' Ch' + c.ch + ' ' + c.topic); continue; }

    console.log('Generating: ' + c.subject + ' Ch' + c.ch + ' ' + c.topic + '...');
    const base = 'SPM ' + c.subject + ' Form ' + c.form + ' Chapter ' + c.ch + ': ' + c.topic + ' (' + c.sub + '). ';
    try {
      const intro  = await gen(base + 'Write 2 warm paragraphs introducing this topic for SPM students. Plain text only.');
      const body   = await gen(base + 'Explain all key concepts and formulas clearly. 300 words. Plain text only.');
      const ex     = await gen(base + 'Write 2 fully worked SPM-style examples with complete step-by-step solutions. Plain text only.');
      const mis    = await gen(base + 'List 4 common mistakes students make with corrections. Plain text only.');
      const sum    = await gen(base + 'List all key formulas and points to remember for SPM exam. Plain text only.');

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
