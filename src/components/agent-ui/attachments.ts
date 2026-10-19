import type { FileUIPart } from 'ai';

// Same limits as the server (src/lib/agent/history.ts) and the New Interview form.
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
export const ATTACHMENT_ACCEPT = '.pdf,.docx,.txt';

const MEDIA_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

// Files travel inline as data URLs. The media type comes from the extension
// because browsers report DOCX inconsistently.
export const readAttachment = (file: File): Promise<FileUIPart> =>
  new Promise((resolve, reject) => {
    const extension = file.name.toLowerCase().split('.').pop() ?? '';
    const mediaType = MEDIA_TYPES[extension];

    if (!mediaType) return reject(new Error(`${file.name}: only PDF, DOCX and TXT files are supported`));
    if (file.size > MAX_ATTACHMENT_BYTES) return reject(new Error(`${file.name}: files can be at most 10MB`));

    const reader = new FileReader();

    reader.onload = () => {
      const base64 = String(reader.result).split(',')[1] ?? '';

      resolve({ type: 'file', mediaType, filename: file.name, url: `data:${mediaType};base64,${base64}` });
    };
    reader.onerror = () => reject(new Error(`${file.name}: could not be read`));
    reader.readAsDataURL(file);
  });
