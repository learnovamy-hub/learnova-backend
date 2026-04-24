const AdmZip = require('adm-zip');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const path = require('path');

async function extractText(pdfBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const doc = await loadingTask.promise;
  let text = '';
  for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  return text;
}

async function test() {
  const zipPath = process.argv[2];
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter(e => e.entryName.match(/K1/i) && e.entryName.endsWith('.pdf') && e.header.size > 10000);
  console.log('Found', entries.length, 'papers');
  const entry = entries[2];
  console.log('Testing:', path.basename(entry.entryName));
  const text = await extractText(entry.getData());
  console.log('Text length:', text.length);
  console.log('First 1000 chars:\n', text.substring(0, 1000));
}
test().catch(console.error);
