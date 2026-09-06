import { HttpError } from './errors.js';

export async function extractUpload(file) {
  if (!file) throw new HttpError(400, 'Choose a PDF, TXT or Markdown file. 请选择学习资料。');
  const name = file.originalname || 'Material';
  if (/\.(txt|md|markdown)$/i.test(name)) {
    const text = file.buffer
      .toString('utf8')
      .replace(/\u0000/g, '')
      .trim();
    if (text.length < 400)
      throw new HttpError(400, 'Material is too short. 请提供至少 400 字符的课程内容。');
    if (text.length > 36000)
      throw new HttpError(400, 'Material is too long. 请拆分为不超过 36,000 字符的章节。');
    return text;
  }
  if (!/\.pdf$/i.test(name) || file.buffer.subarray(0, 5).toString() !== '%PDF-')
    throw new HttpError(400, 'Supported formats: PDF, TXT, MD.');
  let task;
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    task = getDocument({
      data: new Uint8Array(file.buffer),
      isEvalSupported: false,
      useSystemFonts: false,
      stopAtErrors: true,
      verbosity: 0,
    });
    const pdf = await task.promise;
    if (pdf.numPages > 60)
      throw new HttpError(400, 'Use a PDF with at most 60 pages. 请按章节拆分资料。');
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(`[Page ${pageNumber}]\n${content.items.map((item) => item.str || '').join(' ')}`);
      if (pages.join('\n').length > 36000)
        throw new HttpError(400, 'PDF text is too long. 请按章节拆分资料。');
    }
    const text = pages.join('\n\n').trim();
    if (text.replace(/\[Page \d+\]/g, '').trim().length < 400)
      throw new HttpError(
        400,
        'No readable text found. Scanned PDFs need OCR first. 扫描件请先转换为可选中文字的 PDF。',
      );
    return text;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Unable to read this PDF. Use an unencrypted, text-based PDF.');
  } finally {
    try {
      await task?.destroy();
    } catch {
      /* Cleanup must not replace the useful validation error. */
    }
  }
}
