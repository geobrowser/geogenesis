// Dev-only cost estimation. Update PER_MTOK when prices change.
// Source: https://platform.claude.com/docs/en/docs/about-claude/pricing
type ModelPricing = {
  input: number; // base (uncached) input
  cacheWrite5m: number; // 5-minute cache write
  cacheRead: number; // cache hit / read
  output: number;
};

const PER_MTOK: Record<string, ModelPricing> = {
  'claude-haiku-4-5': { input: 1, cacheWrite5m: 1.25, cacheRead: 0.1, output: 5 },
  'claude-sonnet-4-6': { input: 3, cacheWrite5m: 3.75, cacheRead: 0.3, output: 15 },
};

// Subset of the AI SDK's LanguageModelUsage we actually price on.
export type ChatUsage = {
  inputTokens?: number;
  outputTokens?: number;
  inputTokenDetails?: {
    noCacheTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
};

export type CostStage = {
  stage: string;
  model: string;
  usage: ChatUsage;
};

type StageCost = {
  stage: string;
  model: string;
  noCache: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  usd: number;
};

function estimateStageCost({ stage, model, usage }: CostStage): StageCost {
  const details = usage.inputTokenDetails ?? {};
  const cacheRead = details.cacheReadTokens ?? 0;
  const cacheWrite = details.cacheWriteTokens ?? 0;
  // noCacheTokens can be absent; back it out of the input total when so.
  const noCache = details.noCacheTokens ?? Math.max(0, (usage.inputTokens ?? 0) - cacheRead - cacheWrite);
  const output = usage.outputTokens ?? 0;

  const pricing = PER_MTOK[model];
  const usd = pricing
    ? (noCache * pricing.input +
        cacheRead * pricing.cacheRead +
        cacheWrite * pricing.cacheWrite5m +
        output * pricing.output) /
      1_000_000
    : 0;

  return { stage, model, noCache, cacheRead, cacheWrite, output, usd };
}

const fmtUsd = (usd: number) => `$${usd.toFixed(2)}`;

function shortModel(model: string): string {
  if (model.includes('haiku')) return 'haiku';
  if (model.includes('sonnet')) return 'sonnet';
  if (model.includes('opus')) return 'opus';
  return model;
}

export function formatTurnCost(stages: CostStage[], label = 'total'): string {
  const rows = stages.map(estimateStageCost);
  const total = rows.reduce((sum, r) => sum + r.usd, 0);

  const byModel = new Map<string, number>();
  for (const r of rows) byModel.set(r.model, (byModel.get(r.model) ?? 0) + r.usd);

  const modelPart = [...byModel.entries()].map(([model, usd]) => `${shortModel(model)} ${fmtUsd(usd)}`).join(' · ');

  return `[chat:cost] ${label} ${fmtUsd(total)} (${modelPart})`;
}

// Token cost only — hosted webSearch's $10/1k-searches charge isn't included.
export function logCallCost(stage: string, model: string, usage: ChatUsage): void {
  if (process.env.NODE_ENV === 'production' && process.env.CHAT_DEBUG !== '1') return;
  console.log(formatTurnCost([{ stage, model, usage }], `${stage} call`));
}
