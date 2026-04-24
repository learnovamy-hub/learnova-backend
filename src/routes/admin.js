import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/database.js';

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

async function generateQuestions(subject, topicName) {
  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: 'You are a Malaysian SPM ' + subject + ' teacher. Generate 5 MCQ questions for topic: "' + topicName + '". Rules: SPM Form 4-5 level, 4 options each (A/B/C/D), mix easy/medium/hard, no textbook copying. Respond ONLY with JSON array, no markdown: [{"question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"correct_answer":"A","explanation":"...","difficulty":"easy"}]'
    }]
  });
  const text = r.content[0].text.trim().replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

router.post('/seed-quizzes', async (req, res) => {
  const { subject: filterSubject, limit = 50 } = req.query;
  res.json({ message: 'Quiz seeding started in background. Check Railway logs.', status: 'running' });

  try {
    let query = supabase.from('faq_cache').select('subject, topic').order('subject').order('topic');
    if (filterSubject) query = query.eq('subject', filterSubject);
    const { data: rows, error } = await query;
    if (error) { console.error('[SEED] faq_cache error:', error); return; }

    const seen = new Set();
    const pairs = [];
    for (const row of (rows || [])) {
      const key = row.subject + '|' + row.topic;
      if (!seen.has(key)) { seen.add(key); pairs.push({ subject: row.subject, topic: row.topic }); }
    }

    console.log('[SEED] Found ' + pairs.length + ' unique topics');

    for (const p of pairs.slice(0, parseInt(limit))) {
      try {
        const { data: existing } = await supabase.from('quizzes').select('id').eq('subject', p.subject).eq('topic', p.topic).maybeSingle();
        if (existing) { console.log('[SEED] Skip: ' + p.topic); continue; }

        console.log('[SEED] Generating: ' + p.subject + ' - ' + p.topic);
        const qs = await generateQuestions(p.subject, p.topic);

        const { data: quiz, error: qe } = await supabase.from('quizzes').insert([{
          title: p.topic + ' Quiz',
          topic: p.topic,
          subject: p.subject,
          question_count: qs.length,
          total_questions: qs.length,
          difficulty: 'mixed',
          is_published: true,
        }]).select().single();

        if (qe) { console.error('[SEED] Quiz insert error:', qe); continue; }

        const questionRows = qs.map(q => ({
          quiz_id: quiz.id,
          question: q.question,
          type: 'mcq',
          question_type: 'mcq',
          options: q.options,
          correct_answer: q.correct_answer,
          explanation: q.explanation,
        }));

        const { error: qerr } = await supabase.from('quiz_questions').insert(questionRows);
        if (qerr) { console.error('[SEED] Questions insert error:', qerr); continue; }

        console.log('[SEED] Done: ' + p.topic + ' (' + qs.length + ' Qs)');
        await new Promise(r => setTimeout(r, 800));

      } catch (err) {
        console.error('[SEED] Error for ' + p.topic + ':', err.message);
      }
    }
    console.log('[SEED] All done!');
  } catch (err) {
    console.error('[SEED] Fatal error:', err);
  }
});

router.get('/seed-quizzes/status', async (req, res) => {
  try {
    const { count: qc } = await supabase.from('quizzes').select('*', { count: 'exact', head: true });
    const { count: qqc } = await supabase.from('quiz_questions').select('*', { count: 'exact', head: true });
    const { data: bs } = await supabase.from('quizzes').select('subject');
    const sc = {};
    (bs || []).forEach(q => { sc[q.subject] = (sc[q.subject] || 0) + 1; });
    res.json({ total_quizzes: qc, total_questions: qqc, by_subject: sc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




router.post('/seed-faqs',async(req,res)=>{const{subject:fs2,form=5}=req.query;res.json({message:'FAQ seeding started',status:'running'});const T={'Mathematics':['Progressions','Linear Law','Integration','Vectors','Trigonometric Functions','Probability','Probability Distributions'],'Add Maths':['Progressions','Linear Law','Integration','Vectors','Probability','Kinematics'],'Physics':['Waves','Electricity','Electromagnetism','Electronics','Nuclear Physics'],'Chemistry':['Thermochemistry','Electrochemistry','Synthetic Polymers','Rate of Reaction'],'Biology':['Transport in Humans','Reproduction','Growth','Inheritance','Variation'],'English':['Essay Writing','Literature','Grammar'],'Bahasa Malaysia':['Penulisan','Komsas','Tatabahasa'],'Sejarah':['Malaysia dalam Era Globalisasi','Pembangunan Negara']};try{const subs=fs2?[fs2]:Object.keys(T);let tot=0;for(const sub of subs){for(const top of(T[sub]||[])){try{const{data:ex}=await supabase.from('faq_cache').select('id').eq('subject',sub).eq('topic',top).eq('form_level',String(form)).limit(1);if(ex&&ex.length>0){console.log('[FAQ] Skip:',top);continue;}console.log('[FAQ] Gen:',sub,'F'+form,top);const p='Malaysian SPM '+sub+' Form '+form+' teacher. Generate 8 student FAQ for topic: '+top+'. Return ONLY JSON array: [{question,answer,topic,subject}]';const rv=await anthropic.messages.create({model:'claude-sonnet-4-5',max_tokens:2000,messages:[{role:'user',content:p}]});const faqs=JSON.parse(rv.content[0].text.trim().replace(/`json|`/g,'').trim());if(!Array.isArray(faqs))continue;const rows=faqs.map(f=>({subject:sub,topic:top,question:f.question,answer:f.answer,form_level:String(form),source:'claude_ai',related_questions:[]}));await supabase.from('faq_cache').upsert(rows,{onConflict:'subject,question',ignoreDuplicates:true});tot+=faqs.length;console.log('[FAQ] Done:',top,faqs.length);await new Promise(r=>setTimeout(r,800));}catch(e){console.error('[FAQ] Err:',top,e.message);}}}console.log('[FAQ] Total:',tot);}catch(e){console.error('[FAQ] Fatal:',e);}});
export default router;


