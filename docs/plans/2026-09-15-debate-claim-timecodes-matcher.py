"""Align each published claim to the moment it was said, using the Whisper transcript.

Two stages:
  1. Block -> time window. A transcript block's markdown is the concatenation of consecutive
     same-speaker Whisper segments, so the block's window is found by locating that run of
     segments. Exact, not fuzzy.
  2. Claim -> time window inside its block. The claim sentence is an extractor paraphrase, so
     this is a content-word containment score over every window of consecutive segments in the
     block, with the best window winning and reporting a confidence.
"""

import json
import re

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "can", "could",
    "did", "do", "does", "for", "from", "had", "has", "have", "how", "i", "if", "in", "into",
    "is", "it", "its", "of", "on", "or", "our", "s", "so", "ت", "that", "the", "their", "them",
    "then", "there", "these", "they", "this", "to", "was", "we", "were", "what", "when", "which",
    "who", "will", "with", "would", "you", "your", "not", "no", "more", "than", "also", "just",
    "very", "much", "some", "any", "all", "out", "up", "one", "two", "about", "because", "over",
}

MAX_WINDOW_SEGMENTS = 6


def words(text):
    return re.findall(r"[a-z0-9']+", text.lower())


def content_words(text):
    return [w for w in words(text) if w not in STOPWORDS and len(w) > 2]


def normalize(text):
    return " ".join(words(text))


def find_block_window(block_text, segments):
    """The run of consecutive segments whose joined text matches the block markdown."""
    target = normalize(block_text)
    if not target:
        return None

    best = None
    for start in range(len(segments)):
        joined = ""
        for end in range(start, len(segments)):
            joined = (joined + " " + normalize(segments[end]["text"])).strip()
            if len(joined) > len(target) + 40:
                break
            if joined == target:
                return {"start": start, "end": end, "exact": True}
            # Keep the longest prefix agreement as a fallback for punctuation drift.
            if target.startswith(joined):
                score = len(joined) / len(target)
                if best is None or score > best["score"]:
                    best = {"start": start, "end": end, "exact": False, "score": score}
    return best


def score_window(claim_words, window_text):
    """Containment of the claim's content words in the window, with a length penalty."""
    window_words = set(content_words(window_text))
    if not window_words or not claim_words:
        return 0.0
    hits = sum(1 for w in claim_words if w in window_words)
    containment = hits / len(claim_words)
    # Prefer the tightest window that achieves the containment, so a whole turn does not
    # outscore the sentence inside it.
    precision = hits / max(len(window_words), 1)
    return containment * (0.75 + 0.25 * precision)


def align_claim(claim_text, segments, lo, hi):
    claim_words = content_words(claim_text)
    best = None
    for start in range(lo, hi + 1):
        for end in range(start, min(start + MAX_WINDOW_SEGMENTS, hi + 1)):
            text = " ".join(segments[i]["text"] for i in range(start, end + 1))
            score = score_window(claim_words, text)
            if best is None or score > best["score"]:
                best = {
                    "score": score,
                    "start_ms": segments[start]["start_ms"],
                    "end_ms": segments[end]["end_ms"],
                    "start_index": start,
                    "end_index": end,
                    "text": text,
                }
    return best


def main():
    transcript = json.load(open("transcript.json"))
    graph = json.load(open("graph.json"))

    segments = sorted(transcript["segments"], key=lambda s: (s["start_ms"], s["sequence_index"]))

    blocks = []
    for transcript_relation in graph["data"]["entity"]["transcripts"]:
        for block_relation in transcript_relation["toEntity"]["blocks"]:
            entity = block_relation["toEntity"]
            blocks.append(
                {
                    "relation_id": block_relation["id"],
                    "position": block_relation["position"],
                    "block_id": entity["id"],
                    "markdown": entity["markdown"][0]["text"] if entity["markdown"] else "",
                    "author": entity["authors"][0]["toEntity"]["id"] if entity["authors"] else None,
                    "claims": [
                        {
                            "relation_id": claim["id"],
                            "relation_entity_id": claim["entityId"],
                            "claim_id": claim["toEntity"]["id"],
                            "position": claim["position"],
                            "text": (claim["toEntity"]["names"][0]["text"] if claim["toEntity"]["names"] else ""),
                        }
                        for claim in entity["claims"]
                    ],
                }
            )

    blocks.sort(key=lambda b: b["position"] or "")

    print("=" * 96)
    print("STAGE 1 — block to time window (exact match of block markdown against segment runs)")
    print("=" * 96)

    for index, block in enumerate(blocks):
        window = find_block_window(block["markdown"], segments)
        if window is None:
            block["window"] = None
            print(f"  [{index}] {block['block_id'][:8]}  NO MATCH")
            continue
        lo, hi = window["start"], window["end"]
        block["window"] = window
        block["start_ms"] = segments[lo]["start_ms"]
        block["end_ms"] = segments[hi]["end_ms"]
        block["slot"] = segments[lo]["participant_slot"]
        kind = "exact" if window.get("exact") else f"partial {window.get('score', 0):.0%}"
        print(
            f"  [{index}] pos={block['position']} block={block['block_id'][:8]} "
            f"slot={block['slot']} {block['start_ms'] / 1000:7.1f}s -> {block['end_ms'] / 1000:7.1f}s "
            f"segs {lo}-{hi} ({kind})  claims={len(block['claims'])}"
        )

    matched = [b for b in blocks if b.get("window")]
    by_time = sorted(matched, key=lambda b: b["start_ms"])
    print()
    print("  relation position order :", " ".join(b["block_id"][:6] for b in blocks))
    print("  actual chronological    :", " ".join(b["block_id"][:6] for b in by_time))
    print("  position order == time order:", [b["block_id"] for b in blocks] == [b["block_id"] for b in by_time])

    print()
    print("=" * 96)
    print("STAGE 2 — claim to moment inside its block")
    print("=" * 96)

    output = []
    for block in by_time:
        lo, hi = block["window"]["start"], block["window"]["end"]
        print()
        print(f"  block {block['block_id'][:8]}  slot {block['slot']}  "
              f"{block['start_ms'] / 1000:.1f}s-{block['end_ms'] / 1000:.1f}s")
        for claim in block["claims"]:
            best = align_claim(claim["text"], segments, lo, hi)
            confidence = round(best["score"], 3) if best else 0.0
            verdict = "HIGH" if confidence >= 0.55 else "LOW " if confidence >= 0.35 else "NONE"
            print(f"    [{verdict} {confidence:.2f}] {best['start_ms'] / 1000:6.1f}s -> {best['end_ms'] / 1000:6.1f}s  "
                  f"{claim['text'][:72]}")
            print(f"              heard: \"{best['text'][:96]}\"")
            output.append(
                {
                    "claim_id": claim["claim_id"],
                    "claim_text": claim["text"],
                    "block_id": block["block_id"],
                    "block_claim_relation_id": claim["relation_id"],
                    "relation_entity_id": claim["relation_entity_id"],
                    "participant_slot": block["slot"],
                    "block_start_ms": block["start_ms"],
                    "block_end_ms": block["end_ms"],
                    "start_ms": best["start_ms"] if confidence >= 0.35 else block["start_ms"],
                    "end_ms": best["end_ms"] if confidence >= 0.35 else block["end_ms"],
                    "confidence": confidence,
                    "source": "segment-match" if confidence >= 0.35 else "block-window",
                    "matched_text": best["text"],
                }
            )

    with open("alignment.json", "w") as handle:
        json.dump(output, handle, indent=2)

    high = sum(1 for row in output if row["confidence"] >= 0.55)
    low = sum(1 for row in output if 0.35 <= row["confidence"] < 0.55)
    none = sum(1 for row in output if row["confidence"] < 0.35)
    print()
    print(f"  {len(output)} claims — {high} high confidence, {low} low, {none} fell back to the block window")
    print("  wrote alignment.json")


if __name__ == "__main__":
    main()
