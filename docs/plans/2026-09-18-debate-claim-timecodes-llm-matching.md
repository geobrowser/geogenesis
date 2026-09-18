# Placing every claim on the video by reading the transcript

Supersedes the matcher-only backfill in `2026-09-17-debate-claim-timecodes-backfill.md`, which
published 140 of 617 matched claims and left the rest to a scorer that is wrong about one time in
twenty-two. This places all 701 remaining claims by reading the turn they were made in, and
publishes the result through the same writes.

The word-overlap matcher stays in the app as the fallback, at a 0.40 bar, for anything not published
here — a debate recorded tomorrow, or a claim this pass declines.

---

## Scope — read this first

> Your job is three steps, in order:
>
> 1. **Read** each task file in `claim-matching-tasks/` and decide, for every claim in it, which
>    segments of its turn it was said in.
> 2. **Write** one answers file per task file, in the shape under **The answer format**.
> 3. **Publish** the plan that `build-plan-from-matches.ts` produces, exactly as
>    `2026-09-17-debate-claim-timecodes-backfill.md` describes under **The writes** and
>    **Proposals** — same properties, same `Selector` typing, one proposal per space.
>
> Everything under **Background** is context, not instructions.
>
> **Never write a millisecond value yourself.** You choose segment numbers; the build script turns
> those into offsets by reading them back out of the task file. That is deliberate — it is what makes
> a wrong timecode impossible rather than merely unlikely.
>
> If a claim is not in its turn, say so with `notInTurn` and move on. Do not stretch for it.

---

## Generating the task files

```
bun scripts/export-claims-for-matching.ts --out ./claim-matching-tasks
```

Read-only. As of this writing:

```
wrote 65 task files
  claims to place: 701
  claims already carrying offsets (skipped): 153
```

Each file is one debate. Claims that already carry offsets are left out — a published timecode is
either the extractor's or an earlier reader's, and either beats re-deciding it. That also makes the
whole pass resumable: regenerate and anything already published drops out.

A task file looks like this:

```jsonc
{
  "debateEntityId": "019f6b2b762279329a2757e0e3ce0fe9",
  "debateName": "Bertrand Armando vs. Arturas Vil on Open-source AI models…",
  "spaceId": "41e851610e13a19441c4d980f2f2ce6b",
  "turns": [
    {
      "blockId": "…",
      "turnLocated": true,          // false = the turn could not be placed, so you are given the
                                    // whole debate's segments instead. Still answerable, just wider.
      "segments": [
        { "i": 12, "startMs": 96000, "endMs": 98600, "text": "The restrictions should be" },
        { "i": 13, "startMs": 98600, "endMs": 101500, "text": "maybe more about ability to use" },
        { "i": 14, "startMs": 101500, "endMs": 103200, "text": "them, should not be fully" },
        { "i": 15, "startMs": 103200, "endMs": 105000, "text": "anonymous, etc." }
      ],
      "claims": [
        {
          "claimId": "ad46e41fad9f400f9cff320388751793",
          "relationEntityId": "a4fd8040f3364de7be918b070eeb9fc3",
          "text": "Restrictions on open-source AI could focus on usage, such as preventing fully anonymous use.",
          "matcherGuess": { "startSegment": 12, "endSegment": 15, "score": 0.33 }
        }
      ]
    }
  ]
}
```

## The answer format

One file per task file, **same filename**, in your answers directory:

```json
{
  "matches": [
    { "claimId": "ad46e41fad9f400f9cff320388751793", "startSegment": 12, "endSegment": 15 },
    { "claimId": "8401b74c42f24c80814192bcb526a696", "notInTurn": true }
  ]
}
```

`startSegment` and `endSegment` are the `i` values from that claim's own turn, inclusive. Nothing
else is read.

## How to choose the span

**End on the segment where the claim finishes being made.** The card appears at the end offset, so
that boundary is the one a viewer feels — it is what makes the card read as *he just said this*
rather than arriving mid-sentence. The start matters less; get it roughly right.

**Take the tightest span that contains the claim.** Not the whole turn, not the whole sentence
either if the claim is half of it. If a speaker makes two claims in one sentence, the two spans may
overlap — that is fine and expected.

**`matcherGuess` is there to be checked, not trusted.** It is right far more often than not, so
confirming is quick. But it is the thing being audited: a low score often means a correct match the
extractor simply paraphrased heavily (the example above is correct at 0.33), and a high score can
still be wrong. Read the transcript either way.

**Say `notInTurn` when the claim is not there.** This is the case the matcher cannot express, and
the main reason this pass exists. It happens when the extractor wrote a claim whose specifics live
in the *other* debater's turn, or when the recording was cut. One real example: a claim reading
"tariffs caused the loss of over 100,000 manufacturing jobs" attributed to a turn where the speaker
only got as far as "it is triggering manufacturing job losses. Some data reports indicate—". The
figure is in a different turn. No span in this turn is right, and the matcher's best guess quoted
the speaker saying something else entirely.

A declined claim is not lost. It falls back to the matcher at read time, exactly where it would have
been without any of this, and keeps its place in the claims panel.

**Do not fix the claim text.** If a claim is clumsy, wrong, or a bad summary, place it anyway or
decline it. Editing extracted claims is not this job.

## Building and checking the plan

```
bun scripts/build-plan-from-matches.ts --tasks ./claim-matching-tasks --answers ./answers --out plan.json
```

It rejects, per claim, anything it cannot verify — a segment index outside the turn, a range that
ends before it starts, a claim answered twice, a claim that does not exist in that debate, a missing
relation entity. Each rejection names the claim and the reason. **Rejections are yours to fix and
re-run**, not to publish around.

Read the summary before publishing:

```
placed by reading: <n>
declined as not in the turn: <n>
left unanswered: <n>      <- should be 0; anything here is a claim you skipped
rejected: <n>             <- should be 0 before you publish
```

Then publish `plan.json` exactly as the previous doc describes: group by `spaceId`, one proposal per
space, `Start offset` and `End offset` as integer milliseconds on `entityId`, plus the
`Types → Selector` and `Target property → Debate videos` relations. The plan file carries the
constants so they need not be retyped.

## Verify

```
bun scripts/verify-claim-timing.ts <debateEntityId> <spaceId>
```

Every claim you placed should come back `[published 1.00]`. Claims you declined stay `segment` or
`block`, which is correct. Spot-check a debate per space rather than every claim, and confirm
nothing landed in a space other than the one the task file names.

---

## Background — why the machine owns the milliseconds

*Background, not instructions.*

The obvious design is to ask for timecodes directly. It is the wrong one. A model asked for a number
will produce a plausible number, and a plausible number here is indistinguishable from a correct one
at the point it is written — it becomes a `published` offset, which the app scores 1.0 and no later
gate can demote. A viewer then sees a real person quoted as saying something at a second they were
not saying it.

Choosing a segment cannot fail that way. The offsets are read back out of the file you were given,
so every timecode is a real boundary of the recording. The worst available error is the *wrong*
segment, which is visible on inspection and bounded by the turn.

## Background — what this does and does not fix

*Background, not instructions.*

It fixes the present: 701 claims placed by reading rather than by word overlap, so the cards, the
timecodes and the scrubber hashes are right on debates already published.

It does not replace [GEO-2958](https://linear.app/geobrowser/issue/GEO-2958/publish-claim-startend-offsets-automatically-when-a-debates-claims-are).
The extractor knows the span it drew each claim from; reading a transcript afterwards to recover
something that was known at extraction time is a stopgap however carefully it is done. Every debate
recorded after this pass needs the same treatment again until the backend emits offsets natively.

That is also why the plan records `"source": "llm-read"` — so a later backfill can tell a read
offset from an extractor's own and knows which it may overwrite.
