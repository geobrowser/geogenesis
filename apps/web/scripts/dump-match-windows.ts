/**
 * Dumps each claim, its match score, and the transcript it was matched to — so a human (or an LLM
 * reading the output) can judge whether the match is right and calibrate the confidence bar on more
 * than the one hand-checked debate.
 *
 * Prints the whole turn as well as the matched window, because the question is not "does the window
 * look plausible" but "is this where the claim was actually said, out of everything in this turn".
 *
 * Usage: bun scripts/dump-match-windows.ts [howManyDebates] [skip]
 */
import { contentWords, findBlockWindow, matchClaimWindow } from '../core/debates/claim-timing';
import { fetchAllDebates, fetchDebateClaims, fetchTranscriptSegments } from './lib/debate-claims';

const want = Number(process.argv[2] ?? 5);
const skip = Number(process.argv[3] ?? 0);

const debates = await fetchAllDebates();
let seen = 0;
let used = 0;

for (const debate of debates) {
  if (used >= want) break;

  for (const spaceId of debate.spaceIds ?? []) {
    const claims = await fetchDebateClaims(debate.id, spaceId);
    if (claims.all.length === 0) continue;

    seen += 1;
    if (seen <= skip) break;

    const segments = await fetchTranscriptSegments(debate.id);
    if (segments.length === 0) break;

    const ordered = [...segments].sort((a, b) =>
      a.start_ms === b.start_ms ? a.sequence_index - b.sequence_index : a.start_ms - b.start_ms
    );

    used += 1;
    console.log(`\n\n${'='.repeat(100)}`);
    console.log(`DEBATE ${used}: ${debate.name}`);
    console.log('='.repeat(100));

    for (const block of claims.blocks) {
      const inBlock = claims.all.filter(claim => claim.blockId === block.id);
      if (inBlock.length === 0) continue;

      const window = findBlockWindow(block.text, ordered);
      console.log(`\n--- TURN (${inBlock.length} claim${inBlock.length === 1 ? '' : 's'}) ---`);
      console.log(`TRANSCRIPT: ${block.text}`);

      for (const claim of inBlock) {
        const matched = window ? matchClaimWindow(claim.text, ordered, window) : null;
        console.log(`\n  CLAIM: ${claim.text}`);
        if (!matched) {
          console.log('  SCORE: —   (no window; falls back to the whole turn)');
          continue;
        }
        const text = ordered
          .filter(s => s.start_ms >= matched.startMs && s.end_ms <= matched.endMs)
          .map(s => s.text)
          .join(' ');
        // How much of the claim actually landed, and how much of it exists in the turn at all.
        const claimWords = new Set(contentWords(claim.text));
        const windowWords = new Set(contentWords(text));
        const turnWords = new Set(contentWords(block.text));
        const inWindow = [...claimWords].filter(w => windowWords.has(w)).length;
        const inTurn = [...claimWords].filter(w => turnWords.has(w)).length;
        console.log(
          `  SCORE: ${matched.confidence.toFixed(2)}   words: ${inWindow}/${claimWords.size} in window, ` +
            `${inTurn}/${claimWords.size} anywhere in the turn`
        );
        console.log(`  MATCHED: "${text}"`);
        if (claim.publishedTiming) {
          const same =
            claim.publishedTiming.startMs === matched.startMs && claim.publishedTiming.endMs === matched.endMs;
          console.log(`  PUBLISHED: ${same ? 'same span' : 'DIFFERENT span (a human corrected this)'}`);
        }
      }
    }
    break;
  }
}
