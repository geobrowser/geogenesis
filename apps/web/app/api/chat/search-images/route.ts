// POST /api/chat/search-images
//
// Image-search sub-agent. The main assistant calls this via the `searchImages`
// client tool with an image-focused query; this endpoint runs Anthropic's
// hosted `webSearch` + a Haiku extractor that emits a tight list of direct
// image URLs (jpg/png/webp/gif). The orchestrator never sees the raw
// encrypted_content blobs — same split as /api/chat/research.
import { createAnthropic } from '@ai-sdk/anthropic';

import { generateText, jsonSchema, stepCountIs, tool } from 'ai';
import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';

import { UTILITY_MODEL } from '../models';
import { ipCeilingLimit, loggedInLimit } from '../rate-limit';
import { safeFetch } from '../web-fetch/helpers';

const anthropic = createAnthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const MAX_QUERY_CHARS = 500;
const MAX_RESULTS = 5;
const WEB_SEARCH_MAX_USES = 3;
const MAX_TOOL_STEPS = 5;
const MAX_OUTPUT_TOKENS = 1_500;

// Verification step caps. Each candidate is fetched server-side, capped at 4MB,
// 6s timeout, and resized down by Anthropic's vision pipeline. We pass at most
// MAX_VERIFY_CANDIDATES images to the vision model in one call.
const MAX_VERIFY_CANDIDATES = 5;
const VERIFY_FETCH_TIMEOUT_MS = 6_000;
const VERIFY_MAX_BYTES = 4 * 1024 * 1024;
const VERIFY_MAX_OUTPUT_TOKENS = 500;

const IMAGE_EXTENSION_RE = /\.(jpe?g|png|webp|gif|avif|svg)(?:\?|#|$)/i;

const SYSTEM_PROMPT = `You are an image-finder subagent. The orchestrating assistant gives you a focused query (a title or subject plus the media kind, e.g. a poster, cover, or logo) and your job is to return direct image URLs that can be uploaded to IPFS and shown on a Geo entity page.

Workflow:
- Use webSearch (up to ${WEB_SEARCH_MAX_USES} calls) to find pages with the image. Bias the FIRST search toward canonical sources for the query type below — they ship correct, high-resolution, hotlink-friendly URLs and avoid fan-art / lyric-site noise. Widen to general web only if the canonical pass returns nothing.
  - Album / single / EP covers → Wikipedia ("<title> album wikipedia"), Wikimedia Commons, MusicBrainz Cover Art Archive (\`coverartarchive.org\`).
  - Movie / TV posters & stills → Wikipedia, Wikimedia Commons, TMDb (\`image.tmdb.org\`).
  - Book covers → Open Library (\`covers.openlibrary.org\`), Wikipedia, publisher site.
  - People (portraits, headshots) → Wikimedia Commons, Wikipedia.
  - Logos / brand marks → Wikimedia Commons (look for \`*_logo.svg\` or \`.png\`), the brand's own press kit, Wikipedia.
  - Places, landmarks, products → Wikimedia Commons, Wikipedia, official site.
- The webSearch results contain page snippets. Direct image URLs typically end in .jpg/.jpeg/.png/.webp/.gif (sometimes with query params).
- Once you have results, call \`emitImages\` with the BEST image URLs you found.

Rules:
- Only return URLs that look like direct image files (path ends in .jpg/.jpeg/.png/.webp/.gif/.avif/.svg). Page URLs, search-result URLs, ad URLs are NOT valid.
- NEVER invent or guess URLs. Every URL must come from a webSearch result you saw this turn.
- Prefer https://. Prefer high-resolution where you can tell (Wikimedia thumbnails of width >=600px, full-size TMDb \`/original/\` paths).
- Skip lyric sites, fan wikis with watermarks, and stock-photo previews — they reliably misrepresent the subject.
- If you can't find a direct image URL after searching, call \`emitImages\` with an empty array — don't fabricate.
- Cap output at ${MAX_RESULTS} images. Order by likelihood-of-being-correct (most confident first) — a downstream multimodal verifier will reject mismatches, so don't pad with low-confidence guesses.`;

const VERIFIER_SYSTEM_PROMPT = `You are an image-match verifier. You receive a search query and one or more candidate images. For EACH image, decide whether it is a faithful depiction of the subject named in the query.

Reasoning rules:
- Be strict. The point is to keep wrong/poor matches out of a knowledge graph.
- For album covers, posters, book covers, logos — only ACCEPT if the artwork visibly matches the canonical artwork you'd expect for that title. Text-only covers (e.g. minimalist typography) are valid if the typography and color match the real release. Fan art, mock-ups, parody, low-res thumbnails of a different release, lyric backgrounds, and "no image available" placeholders all REJECT.
- For people, places, products — ACCEPT only if the photo plausibly depicts the named subject. A photo of someone else with the same name, a stock photo, or an unrelated context REJECTS.
- If you are uncertain, REJECT — the orchestrator will widen the search or ask the user.
- Each candidate is referenced by a 0-based index in the order it was passed to you.

Output:
Call the \`report\` tool exactly once. Pass an array \`results\` covering EVERY candidate in order, each with \`{ index, verdict: 'accept' | 'reject', reason }\`. \`reason\` is one short sentence the orchestrator can show the user when nothing passes. Do not write any other text.`;

type ImageEntry = { url: string; title: string | null; sourceUrl: string | null };

type VerifiedImageEntry = ImageEntry & { verifyReason: string | null };

const reportVerificationTool = tool({
  description: 'Report the per-image accept/reject verdicts.',
  inputSchema: jsonSchema<{
    results: Array<{ index: number; verdict: 'accept' | 'reject'; reason?: string }>;
  }>({
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', minimum: 0 },
            verdict: { type: 'string', enum: ['accept', 'reject'] },
            reason: { type: 'string', description: 'Short justification, shown to the user when nothing accepts.' },
          },
          required: ['index', 'verdict'],
          additionalProperties: false,
        },
      },
    },
    required: ['results'],
    additionalProperties: false,
  }),
});

const emitImagesTool = tool({
  description: 'Return the direct image URLs you found (up to 5).',
  inputSchema: jsonSchema<{
    images: Array<{ url: string; title?: string; sourceUrl?: string }>;
  }>({
    type: 'object',
    properties: {
      images: {
        type: 'array',
        maxItems: MAX_RESULTS,
        items: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Direct image URL (http/https, ends in .jpg/.png/.webp/etc.).' },
            title: { type: 'string', description: 'Caption or alt-text for the image.' },
            sourceUrl: { type: 'string', description: 'The page the image was found on.' },
          },
          required: ['url'],
          additionalProperties: false,
        },
      },
    },
    required: ['images'],
    additionalProperties: false,
  }),
});

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin) return process.env.NODE_ENV !== 'production';
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function parseWalletCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(lower) ? lower : null;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return `noip:${crypto.randomUUID()}`;
}

function jsonError(status: number, message: string, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function rateLimitResponse(reset: number) {
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return jsonError(429, 'Rate limit exceeded.', { 'Retry-After': retryAfter.toString() });
}

function validateQuery(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_QUERY_CHARS) return null;
  return trimmed;
}

// Drops anything that isn't a direct image URL — Haiku occasionally returns
// page URLs even when prompted otherwise.
function isDirectImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^https?:\/\//i.test(value)) return false;
  return IMAGE_EXTENSION_RE.test(value);
}

type StepLike = {
  toolCalls?: ReadonlyArray<{ toolName?: string; input?: unknown }>;
  toolResults?: ReadonlyArray<{ toolName?: string; output?: unknown }>;
};

// emitImages may run more than once across steps if the agent is unsure;
// take the LAST emitImages call (the one that closes the loop) and dedupe.
function collectImages(steps: StepLike[]): ImageEntry[] {
  let latest: Array<{ url?: unknown; title?: unknown; sourceUrl?: unknown }> | null = null;
  for (const step of steps) {
    for (const call of step.toolCalls ?? []) {
      if (call.toolName !== 'emitImages') continue;
      const input = call.input as { images?: unknown } | null;
      if (input && Array.isArray(input.images)) {
        latest = input.images as Array<{ url?: unknown; title?: unknown; sourceUrl?: unknown }>;
      }
    }
  }
  if (!latest) return [];

  const seen = new Set<string>();
  const out: ImageEntry[] = [];
  for (const raw of latest) {
    if (!raw || typeof raw !== 'object') continue;
    const url = (raw as Record<string, unknown>).url;
    if (!isDirectImageUrl(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const title = (raw as Record<string, unknown>).title;
    const sourceUrl = (raw as Record<string, unknown>).sourceUrl;
    out.push({
      url,
      title: typeof title === 'string' && title.length > 0 ? title : null,
      sourceUrl: typeof sourceUrl === 'string' && sourceUrl.length > 0 ? sourceUrl : null,
    });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

type FetchedImage = {
  candidate: ImageEntry;
  base64: string;
  mediaType: string;
};

// Server-side fetch with timeout + content-type + size guards. Drops anything
// that doesn't actually decode as an image so the vision step doesn't waste a
// slot on HTML error pages, 404 placeholders, or oversized files.
async function fetchImageForVerification(candidate: ImageEntry): Promise<FetchedImage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_FETCH_TIMEOUT_MS);
  try {
    const res = await safeFetch(candidate.url, {
      signal: controller.signal,
      headers: {
        // Wikimedia / IMDb reject requests without a real-looking UA.
        'User-Agent': 'GeoGenesisImageVerifier/1.0 (+https://www.geobrowser.io)',
        Accept: 'image/*',
      },
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.startsWith('image/')) return null;
    // Cap before reading the body — some hosts ship 50MB hi-res files we can't fit into the vision call.
    const lenHeader = res.headers.get('content-length');
    if (lenHeader) {
      const len = parseInt(lenHeader, 10);
      if (Number.isFinite(len) && len > VERIFY_MAX_BYTES) return null;
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > VERIFY_MAX_BYTES) return null;
    // Anthropic's vision pipeline doesn't support SVG; treat it as un-verifiable
    // and pass it through unverified rather than rejecting outright.
    const normalizedType = contentType.split(';')[0].trim();
    if (normalizedType === 'image/svg+xml') return null;
    const base64 = Buffer.from(buf).toString('base64');
    return { candidate, base64, mediaType: normalizedType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type VerificationVerdict = { index: number; verdict: 'accept' | 'reject'; reason: string | null };

function collectVerdicts(steps: StepLike[]): VerificationVerdict[] {
  let latest: Array<{ index?: unknown; verdict?: unknown; reason?: unknown }> | null = null;
  for (const step of steps) {
    for (const call of step.toolCalls ?? []) {
      if (call.toolName !== 'report') continue;
      const input = call.input as { results?: unknown } | null;
      if (input && Array.isArray(input.results)) {
        latest = input.results as Array<{ index?: unknown; verdict?: unknown; reason?: unknown }>;
      }
    }
  }
  if (!latest) return [];
  const out: VerificationVerdict[] = [];
  for (const raw of latest) {
    if (!raw || typeof raw !== 'object') continue;
    const index = (raw as Record<string, unknown>).index;
    const verdict = (raw as Record<string, unknown>).verdict;
    const reason = (raw as Record<string, unknown>).reason;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) continue;
    if (verdict !== 'accept' && verdict !== 'reject') continue;
    out.push({
      index,
      verdict,
      reason: typeof reason === 'string' && reason.length > 0 ? reason : null,
    });
  }
  return out;
}

// Multimodal verification — fetch each candidate image, hand them to a vision-
// capable Haiku call alongside the query, and keep only the ones the model
// marks `accept`. Candidates that fail to fetch (CORS, 404, oversized, SVG,
// non-image content-type) are passed through unverified — preflight on the
// client still gates them, and we'd rather show a possibly-correct option than
// drop a whole result set because of host quirks.
async function verifyImages(query: string, candidates: ImageEntry[]): Promise<VerifiedImageEntry[]> {
  if (candidates.length === 0) return [];

  const trimmed = candidates.slice(0, MAX_VERIFY_CANDIDATES);
  const fetched = await Promise.all(trimmed.map(fetchImageForVerification));
  const verifiable: FetchedImage[] = [];
  const unverifiable: ImageEntry[] = [];
  fetched.forEach((entry, i) => {
    if (entry) {
      verifiable.push(entry);
    } else {
      unverifiable.push(trimmed[i]);
    }
  });

  // Nothing fetched — fall back to the raw set so we don't return empty just
  // because every host blocked the server-side fetch.
  if (verifiable.length === 0) {
    return trimmed.map(c => ({ ...c, verifyReason: null }));
  }

  let verdicts: VerificationVerdict[] = [];
  try {
    const result = await generateText({
      model: anthropic(UTILITY_MODEL),
      system: VERIFIER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Query: "${query}"\n\nVerify each of the ${verifiable.length} candidate image(s) below. Index order matches the order shown.`,
            },
            ...verifiable.flatMap((entry, idx) => [
              {
                type: 'text' as const,
                text: `Candidate ${idx} — title: ${entry.candidate.title ?? '(none)'} — source: ${entry.candidate.sourceUrl ?? '(unknown)'}`,
              },
              {
                type: 'image' as const,
                image: entry.base64,
                mediaType: entry.mediaType,
              },
            ]),
          ],
        },
      ],
      tools: { report: reportVerificationTool },
      toolChoice: { type: 'tool', toolName: 'report' },
      maxOutputTokens: VERIFY_MAX_OUTPUT_TOKENS,
      stopWhen: stepCountIs(2),
    });
    verdicts = collectVerdicts(result.steps as unknown as StepLike[]);
  } catch (err) {
    console.error('[chat/search-images] verification call failed', err);
    // Verification is a defense-in-depth layer — if it crashes, return the raw
    // candidates rather than starving the orchestrator.
    return trimmed.map(c => ({ ...c, verifyReason: null }));
  }

  // Map verdicts back to verifiable candidates (verdict.index is the slot we
  // passed to the verifier, NOT the original candidate index).
  const verdictByIndex = new Map<number, VerificationVerdict>();
  for (const v of verdicts) verdictByIndex.set(v.index, v);

  const verifiedAccepts: VerifiedImageEntry[] = [];
  const verifiedRejectReasons: string[] = [];
  verifiable.forEach((entry, idx) => {
    const verdict = verdictByIndex.get(idx);
    if (!verdict || verdict.verdict === 'accept') {
      verifiedAccepts.push({ ...entry.candidate, verifyReason: verdict?.reason ?? null });
    } else if (verdict.reason) {
      verifiedRejectReasons.push(verdict.reason);
    }
  });

  // Stitch in candidates we couldn't fetch — they're "unverified" but still
  // plausible. Place them after the verified accepts so the orchestrator picks
  // a vetted URL when one exists.
  const passthrough: VerifiedImageEntry[] = unverifiable.map(c => ({ ...c, verifyReason: null }));
  const combined = [...verifiedAccepts, ...passthrough];

  if (combined.length === 0 && verifiedRejectReasons.length > 0) {
    // All candidates fetched + verified, all rejected — return empty so the
    // orchestrator can ask the user / re-query. The reasons are dropped here
    // (the orchestrator only sees a count), but they show up in server logs.
    console.info('[chat/search-images] all candidates rejected by verifier', verifiedRejectReasons);
  }
  return combined;
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return jsonError(403, 'Forbidden');
  }

  const cookieStore = await cookies();
  const wallet = parseWalletCookie(cookieStore.get(WALLET_ADDRESS)?.value);
  if (!wallet) {
    return jsonError(401, 'Sign in to search images.');
  }
  const ip = getClientIp(req);

  try {
    const [identity, ipCeiling] = await Promise.all([loggedInLimit.limit(wallet), ipCeilingLimit.limit(ip)]);
    if (!identity.success || !ipCeiling.success) {
      const reset = Math.max(identity.success ? 0 : identity.reset, ipCeiling.success ? 0 : ipCeiling.reset);
      return rateLimitResponse(reset);
    }
  } catch (err) {
    console.error('[chat/search-images] rate limiter unavailable', err);
    if (process.env.NODE_ENV === 'production') {
      return jsonError(503, 'Service temporarily unavailable.');
    }
  }

  let query: string;
  try {
    const body = await req.json();
    const validated = validateQuery(body?.query);
    if (!validated) return jsonError(400, 'Invalid query');
    query = validated;
  } catch {
    return jsonError(400, 'Invalid request body');
  }

  try {
    const result = await generateText({
      model: anthropic(UTILITY_MODEL),
      system: SYSTEM_PROMPT,
      prompt: query,
      tools: {
        webSearch: anthropic.tools.webSearch_20250305({ maxUses: WEB_SEARCH_MAX_USES }),
        emitImages: emitImagesTool,
      },
      toolChoice: 'auto',
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      providerOptions: {
        anthropic: { disableParallelToolUse: true },
      },
    });

    const rawImages = collectImages(result.steps as unknown as StepLike[]);
    const images = await verifyImages(query, rawImages);
    return new Response(JSON.stringify({ images }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[chat/search-images] generation failed', err);
    return jsonError(502, 'Image search failed.');
  }
}
