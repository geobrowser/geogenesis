type PersonalRankingOgGenerateInput = {
  rankEntityId: string;
  authorSpaceId: string;
  blockEntityId: string;
  blockEntitySpaceId: string;
  rankingStartDate: string;
  rankingEndDate: string;
  ogVersion: string;
};

type GlobalRankingOgGenerateInput = {
  blockEntityId: string;
  blockEntitySpaceId: string;
  rankingStartDate: string;
  rankingEndDate: string;
  globalOgVersion: string;
};

async function postRankingOgGenerate(body: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await fetch('/api/ranking-og/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error('[ranking-og/generate-client] failed:', response.status, errorBody);
      return false;
    }
    const result = (await response.json()) as { ok?: boolean; imageUrls?: { landscape?: string } };
    return Boolean(result.ok && result.imageUrls?.landscape);
  } catch (error) {
    console.error('[ranking-og/generate-client] failed:', error);
    return false;
  }
}

export async function generatePersonalRankingOgImages(input: PersonalRankingOgGenerateInput): Promise<boolean> {
  return postRankingOgGenerate({
    scope: 'personal',
    ...input,
    variants: ['landscape', 'story'],
  });
}

export async function generateGlobalRankingOgImages(input: GlobalRankingOgGenerateInput): Promise<boolean> {
  return postRankingOgGenerate({
    scope: 'global',
    ...input,
    variants: ['landscape', 'story'],
  });
}
