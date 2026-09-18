# Placing every claim on the video by reading the transcript

Supersedes the matcher-only backfill in `2026-09-17-debate-claim-timecodes-backfill.md`, which
published 140 of 617 matched claims and left the rest to a scorer that is wrong about one time in
twenty-two. This places the 701 unplaced claims by reading the turn they were made in, re-reads the
153 already published, and publishes the result through the same writes.

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
> Claims arrive in two states. Most have no offset and need placing. 153 already carry one and need
> **confirming or correcting** — answer them exactly the same way, from the transcript, and the build
> script works out whether your answer agrees with what is live. Do not read the published span first
> and then look for evidence for it.
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
wrote 66 task files
  claims in the task files: 854
  of which already carry offsets: 153 — confirm or correct these
```

Each file is one debate. Pass `--skip-published` to leave the 153 out and place only the 701 — useful
for a second pass, since a confirmed claim is unchanged on disk and will come back again otherwise.

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
          "published": null,          // non-null = an offset is already live; confirm or correct it
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

## Claims that already carry an offset

`published` is non-null on 153 of the 854, and carries the live span in both units:

```jsonc
"published": {
  "startMs": 96000, "endMs": 105000,
  "startSegment": 12, "endSegment": 15,
  "onSegmentBoundaries": true   // false = the span was set by hand and cuts inside a segment
}
```

Answer these the same way as any other claim: read the turn, pick the span, ignore what is there.
The build script compares your answer to `published` and reports it as **confirmed** (no write) or
**corrected** (a write that replaces the live offset). That comparison is only worth anything if you
form the answer before you look at the field, so read the transcript first.

Three of the 153 have `onSegmentBoundaries: false` — a person set those by hand to a boundary inside
a segment. Segments are the only unit you can answer in, so agreeing with one of those would still
come out as a span rounded outward to the segment edges. Answer them normally; the script will not
overwrite a hand-set span either way, and prints them for a person instead.

**`notInTurn` on a published claim is not a decline** — it says a live offset is wrong. The script
will not act on it (removing an offset is a different operation, and the call is a person's); it
prints those claims for a human. Use it, but mean it.

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
published offsets confirmed as correct: <n>   <- agreed with; no write spent
published offsets corrected: <n>              <- your span replaces the live one
declined as not in the turn: <n>
left unanswered: <n>      <- should be 0; anything here is a claim you skipped
rejected: <n>             <- should be 0 before you publish
```

Two lists print separately and are **not** written — they are a person's call, so hand them over
rather than acting on them: hand-set offsets you answered differently, and published offsets you
marked `notInTurn`.

A correction is an overwrite of a live offset, so they are worth a second look before publishing:
each carries `corrects` in the plan with the span it replaces. If the count is far above a handful,
something is wrong with the reading, not with 153 published offsets.

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

It fixes the present: 854 claims placed or checked by reading rather than by word overlap, so the
cards, the timecodes and the scrubber hashes are right on debates already published.

Including the 153 is the part worth defending. 140 of them were written by the matcher alone at a
0.70 score with nothing reading the transcript behind them, and the app scores a published offset
1.00 — there is no later gate that can demote one, so an error in one of those is invisible from then
on. They cost a fifth again on top of the unplaced claims, and this is the only pass that will look
at them.

It does not replace [GEO-2958](https://linear.app/geobrowser/issue/GEO-2958/publish-claim-startend-offsets-automatically-when-a-debates-claims-are).
The extractor knows the span it drew each claim from; reading a transcript afterwards to recover
something that was known at extraction time is a stopgap however carefully it is done. Every debate
recorded after this pass needs the same treatment again until the backend emits offsets natively.

That is also why the plan records `"source": "llm-read"` — so a later backfill can tell a read
offset from an extractor's own and knows which it may overwrite.
