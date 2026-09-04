'use client';

/**
 * Where an attached image waits while the assistant works out what to do with it.
 *
 * The file itself never leaves the browser until a tool acts on it: the model is
 * told the name, type and size, and nothing else. When `setEntityImage` finally
 * runs, the dispatcher looks the file back up by id and hands it to
 * `storage.images.createAndLink({ file })` — the same path the entity page's own
 * upload control takes.
 *
 * Memory only, unlike `ImportSessions`. A spreadsheet is worth persisting because
 * an import spans several turns and tends to end in a page refresh; an image is
 * normally attached and used in the same turn. A reload therefore loses it, and
 * that is reported as `attachment_not_found` rather than papered over — the
 * assistant asks for it again instead of quietly setting nothing.
 */

/**
 * Raster formats only.
 *
 * SVG is deliberately absent. It is the one image format that can carry script,
 * and this is a new path for user-supplied files; `<img src>` will not execute
 * it, but the margin is not worth spending on a format nobody uploads as a cover
 * photo. URLs pointing at SVGs still work — that path is unchanged.
 */
export const ACCEPTED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] as const;

/** For the file picker's `accept`. Mirrors the MIME list above. */
export const ACCEPTED_IMAGE_EXTENSIONS = '.jpg,.jpeg,.png,.webp,.gif,.avif';

export function isAcceptedImage(file: File): boolean {
  const mime = file.type.split(';')[0].trim().toLowerCase();
  return (ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}

/** True for anything the user plausibly meant as an image, so a `.svg` or `.tiff` gets a real message instead of a spreadsheet parse error. */
export function looksLikeImage(file: File): boolean {
  return file.type.toLowerCase().startsWith('image/');
}

export type ImageAttachment = {
  id: string;
  file: File;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

const attachments = new Map<string, ImageAttachment>();

export const ImageAttachments = {
  set(attachment: ImageAttachment): void {
    attachments.set(attachment.id, attachment);
  },

  get(id: string): ImageAttachment | null {
    return attachments.get(id) ?? null;
  },

  clear(id: string): void {
    attachments.delete(id);
  },

  clearAll(): void {
    attachments.clear();
  },
};
