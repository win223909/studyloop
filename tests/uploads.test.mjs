import test from 'node:test';
import assert from 'node:assert/strict';
import { extractUpload } from '../server/uploads.js';

test('text and Markdown extraction enforce readable bounded material', async () => {
  const text = 'Fractions describe equal parts of a whole. '.repeat(14);
  assert.equal(
    await extractUpload({ originalname: 'notes.md', buffer: Buffer.from(text) }),
    text.trim(),
  );
  await assert.rejects(
    extractUpload({ originalname: 'notes.txt', buffer: Buffer.from('short') }),
    /too short/,
  );
  await assert.rejects(
    extractUpload({ originalname: 'notes.html', buffer: Buffer.from(text) }),
    /Supported formats/,
  );
  await assert.rejects(
    extractUpload({ originalname: 'fake.pdf', buffer: Buffer.from(text) }),
    /Supported formats/,
  );
});

test('PDF extraction reads real text with page references', async () => {
  const text =
    'Fractions describe equal parts of a whole. The denominator counts the equal parts. The numerator counts selected parts.';
  const stream = `BT /F1 9 Tf 30 700 Td ${Array.from({ length: 4 }, () => `(${text}) Tj 0 -20 Td`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)
    .join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const result = await extractUpload({ originalname: 'lesson.pdf', buffer: Buffer.from(pdf) });
  assert.match(result, /\[Page 1\]/);
  assert.match(result, /denominator counts/);
});
