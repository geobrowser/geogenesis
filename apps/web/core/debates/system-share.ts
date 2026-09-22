'use client';

export type DebateSystemSharePayload = 'video' | 'link';

/**
 * Whether this browser has an OS share sheet to open at all. Desktop browsers largely do not, and
 * the ones that do offer a thinner sheet than the in-app one — so this gates only the mobile path.
 */
export function canSystemShare() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

function canSystemShareFile(file: File) {
  if (typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Hands a debate to the OS share sheet: the social cut when one is already in memory, the debate's
 * link otherwise.
 *
 * Synchronous up to the `navigator.share` call on purpose. `share()` needs the click's transient
 * activation, and the first `await` spends it — so this can only offer a file that already exists,
 * never one it would have to fetch first. That is what keeps the mobile button instant, and it is
 * why the link is the common case rather than a failure mode.
 */
export function shareDebateWithSystemSheet({
  title,
  text,
  url,
  file,
}: {
  title: string;
  text: string;
  url: string;
  file: File | null;
}): { payload: DebateSystemSharePayload; shared: Promise<void> } {
  // Title and file only, as the pre-sheet Share button shared them: adding `text` alongside a file
  // leads some targets to take the text and drop the video.
  if (file && canSystemShareFile(file)) {
    return { payload: 'video', shared: navigator.share({ title, files: [file] }) };
  }

  return { payload: 'link', shared: navigator.share({ title, text, url }) };
}
