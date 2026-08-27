export const PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT = 'Type / for commands or start writing...';

export const PROFILE_OVERVIEW_TAIL_BLOCK_SENTINEL = '\uE000';

export function isProfileOverviewMarkdownNoiseLine(trimmedLine: string): boolean {
  if (!trimmedLine) return true;
  if (trimmedLine === PROFILE_OVERVIEW_TAIL_BLOCK_SENTINEL) return true;
  if (trimmedLine === PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT) return true;
  // Persisted rows from older builds if placeholder wording drifted slightly
  if (/^Type \/ for commands or start writ/i.test(trimmedLine)) return true;
  return false;
}

export function stripProfileOverviewMarkdownNoise(markdown: string): string {
  const lines = markdown.split('\n').flatMap(line => {
    const t = line.trim();
    return isProfileOverviewMarkdownNoiseLine(t) ? [] : [line];
  });
  return lines.join('\n').trim();
}

export function profileOverviewTextBlockMarkdownForContentCheck(markdown: string): string {
  const mdTrimmed = markdown.trim();
  if (mdTrimmed === PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT) return '';
  if (mdTrimmed === PROFILE_OVERVIEW_TAIL_BLOCK_SENTINEL) return '';
  return markdown;
}
