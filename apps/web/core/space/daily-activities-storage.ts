const STORAGE_PREFIX = 'geogenesis.daily-activities.upload.v1';

function localDayKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function storageKey(spaceId: string, day = localDayKey()): string {
  return `${STORAGE_PREFIX}:${spaceId}:${day}`;
}

export function readDailyUploadComplete(spaceId: string, now = new Date()): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(storageKey(spaceId, localDayKey(now))) === '1';
  } catch {
    return false;
  }
}

export function markDailyUploadComplete(spaceId: string, now = new Date()): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(spaceId, localDayKey(now)), '1');
    window.dispatchEvent(new CustomEvent('geo:daily-activities-upload', { detail: { spaceId } }));
  } catch {
    // Ignore quota / private-mode failures — checklist simply won't persist.
  }
}

export function msUntilNextLocalMidnight(now = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - now.getTime());
}
