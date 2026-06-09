export type RankingSubmission = {
  submitterId: string;
  orderedEntityIds: string[];
  updatedAt: string;
};

export type RankingSubmissionsBlob = {
  version: 1;
  submissions: Record<string, RankingSubmission>;
};

export function emptySubmissionsBlob(): RankingSubmissionsBlob {
  return { version: 1, submissions: {} };
}

export function parseSubmissionsBlob(raw: string | null | undefined): RankingSubmissionsBlob {
  if (!raw?.trim()) return emptySubmissionsBlob();
  try {
    const parsed = JSON.parse(raw) as RankingSubmissionsBlob;
    if (parsed?.version !== 1 || typeof parsed.submissions !== 'object' || parsed.submissions == null) {
      return emptySubmissionsBlob();
    }
    return parsed;
  } catch {
    return emptySubmissionsBlob();
  }
}

export function serializeSubmissionsBlob(blob: RankingSubmissionsBlob): string {
  return JSON.stringify(blob);
}

export function upsertSubmission(
  blob: RankingSubmissionsBlob,
  submitterId: string,
  orderedEntityIds: string[]
): RankingSubmissionsBlob {
  const trimmed = orderedEntityIds.filter(Boolean);
  const unique = [...new Set(trimmed)];
  return {
    version: 1,
    submissions: {
      ...blob.submissions,
      [submitterId]: {
        submitterId,
        orderedEntityIds: unique,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

export function submissionsStorageKey(spaceId: string, blockId: string): string {
  return `geogenesis.ranking-submissions.v1:${spaceId}:${blockId}`;
}
