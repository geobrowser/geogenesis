export type RankingSubmission = {
  submitterId: string;
  orderedEntityIds: string[];
  updatedAt: string;
};

export type RankingSubmissionsBlob = {
  version: 1;
  submissions: Record<string, RankingSubmission>;
};

export type LeaderboardEntry = {
  entityId: string;
  /** Borda aggregate — surfaced in UI only when `RANKING_POINTS_UI_ENABLED` (competition-linked). */
  score: number;
  rank: number;
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

/**
 * Client-side Borda aggregate (interim until fetchAggregatedRankings ships).
 * TODO(ranking-api): Replace aggregateLeaderboardFromSubmissions with fetchAggregatedRankings(blockId).
 */
export function aggregateLeaderboardFromSubmissions(
  submissions: Array<{ orderedEntityIds: string[] }>
): LeaderboardEntry[] {
  const scores = new Map<string, number>();

  for (const submission of submissions) {
    const n = submission.orderedEntityIds.length;
    submission.orderedEntityIds.forEach((entityId, index) => {
      const points = Math.max(n - index, 0);
      scores.set(entityId, (scores.get(entityId) ?? 0) + points);
    });
  }

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return sorted.map(([entityId, score], index) => ({
    entityId,
    score,
    rank: index + 1,
  }));
}

export function aggregateLeaderboard(blob: RankingSubmissionsBlob): LeaderboardEntry[] {
  return aggregateLeaderboardFromSubmissions(Object.values(blob.submissions));
}

export function submissionsStorageKey(spaceId: string, blockId: string): string {
  return `geogenesis.ranking-submissions.v1:${spaceId}:${blockId}`;
}
