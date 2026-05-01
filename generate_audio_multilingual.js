import { createClient } from '@supabase/supabase-js';
import https from 'https';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const CLAUDE_KEY = process.env.CLAUDE_API_KEY;

const LANGS = {
  en: { voice: 'nova', label: 'English' },
  ms: { voice: 'nova', label: 'Bahasa Melayu' },
  zh: { voice: 'nova', label: 'Mandarin' },
  ta: { voice: 'nova', label: 'Tamil' },
};

async function translate(text, lang) {
  if (lang === 'en') return text;
  const names = { ms: 'Bahasa Malaysia', zh: 'Mandarin Chinese Simplified', ta: 'Tamil' };
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, messages: [{ role: 'user', content: `Translate to ${names[lang]} for SPM students. Return ONLY translated text:\n\n${text.substring(0, 800)}` }] });
    const req = https.request({ hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST', headers: { 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString()).content[0].text.trim()); } catch(e) { reject(e); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function tts(text, voice) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'tts-1', input: text.substring(0, 4000), voice });
    const req = https.request({ hostname: 'api.openai.com', path: '/v1/audio/speech', method: 'POST', headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      if (res.statusCode !== 200) { let e = ''; res.on('data', d => e += d); res.on('end', () => reject(new Error(res.statusCode + ': ' + e))); return; }
      const chunks = []; res.on('data', d => chunks.push(d)); res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function upload(buf, name) {
  const { error } = await supabase.storage.from('lesson-audio').upload(name, buf, { contentType: 'audio/mpeg', upsert: true });
  if (error) throw new Error(error.message);
  return supabase.storage.from('lesson-audio').getPublicUrl(name).data.publicUrl;
}

async function main() {
  console.log('Multilingual Audio Generator\n');
  if (!OPENAI_KEY) { console.error('Set OPENAI_API_KEY'); process.exit(1); }
  
  const { data: lessons } = await supabase.from('lessons').select('id,subject,topic,form_level,introduction,content,summary,audio_url').eq('status','published').order('subject');
  console.log('Lessons:', lessons.length, '\n');
  
  let done = 0, cost = 0;
  for (const l of lessons) {
    for (const [lang, cfg] of Object.entries(LANGS)) {
      const field = lang === 'en' ? 'audio_url' : `audio_url_${lang}`;
      if (l[field]) { process.stdout.write(`skip [${lang}] ${l.topic}\n`); continue; }
      try {
        process.stdout.write(`[${lang}] ${l.subject} - ${l.topic}... `);
        const raw = [l.introduction, (l.content||'').split('\n\n')[0], l.summary].filter(Boolean).join('\n\n').substring(0, 1200);
        const text = await translate(raw, lang);
        const audio = await tts(text, cfg.voice);
        const url = await upload(audio, `${l.id}_${lang}.mp3`);
        await supabase.from('lessons').update({ [field]: url }).eq('id', l.id);
        cost += text.length / 1000 * 0.015;
        done++;
        console.log(`OK (${Math.round(audio.length/1024)}KB)`);
        await new Promise(r => setTimeout(r, 600));
      } catch(e) { console.log('FAILED:', e.message); }
    }
  }
  console.log(`\nDone: ${done} files, ~$${cost.toFixed(2)}`);
}
main().catch(console.error);
