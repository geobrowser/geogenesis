'use client';

import * as React from 'react';

import type { Relation } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { SectionTitle } from '~/partials/entity-page/section-title';

/**
 * The small bordered chip the custom entity views label things with — a topic's type, a claim's
 * tags, and every chip in {@link RelationChipSection}.
 *
 * One definition. The claim view and the topic view each carried a byte-identical copy of this
 * string, which is how the two drifted apart in the first place.
 */
export const META_CHIP_CLASS =
  'flex h-6 max-w-full items-center rounded border border-grey-02 bg-white px-1.5 text-metadata';

/**
 * How many chips show before the rest collapse behind a `+N`.
 *
 * Eight, which is what the topic view's subtopics have always used. The claim view's topics used to
 * cap at three, but that number was chosen for a run of chips squeezed into the header's meta row
 * beside the type — as a section of its own there is room, and the two answer the same question.
 */
const CHIP_CAP = 8;

/**
 * A labelled row of entity chips with a `+N` that reveals the rest.
 *
 * Chips rather than cards: fourteen of these should cost a line or two, not a screen. `+N` expands
 * in place rather than linking somewhere, because the whole point of the section is to be scanned
 * without leaving the page.
 *
 * Generic over the relation it draws (GEO-2781). It began as the topic view's Subtopics and is now
 * the claim view's Topics as well — different relations, same question for the reader ("what else
 * is this about, and where can I go next"), so they get the same answer rather than two that look
 * alike until one of them changes.
 */
export function RelationChipSection({
  label,
  relations,
  spaceId,
}: {
  /** Also the section's accessible name, so the two can never disagree. */
  label: string;
  relations: Relation[];
  spaceId: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const chipsRef = React.useRef<HTMLDivElement>(null);
  // Only when the viewer asked for it — not on a section that renders expanded for another reason,
  // and not on mount.
  const focusAfterExpandRef = React.useRef(false);

  // The `+N` removes itself by revealing everything, which leaves focus on a detached button and
  // the browser drops it to `<body>`. A keyboard viewer would then have to tab from the top of the
  // page to reach the very chips they just asked to see, so send them to the first of them.
  React.useEffect(() => {
    if (!expanded || !focusAfterExpandRef.current) return;
    focusAfterExpandRef.current = false;
    chipsRef.current?.querySelectorAll<HTMLAnchorElement>('a')[CHIP_CAP]?.focus();
  }, [expanded]);

  if (relations.length === 0) return null;

  const visible = expanded ? relations : relations.slice(0, CHIP_CAP);
  const hidden = relations.length - visible.length;

  return (
    <section aria-label={label}>
      <SectionTitle>{label}</SectionTitle>
      <div ref={chipsRef} className="flex flex-wrap gap-1.5">
        {visible.map(relation => (
          <Link
            key={relation.id}
            href={NavUtils.toEntity(spaceId, relation.toEntity.id)}
            className={`${META_CHIP_CLASS} text-text transition-colors hover:border-text`}
          >
            <span className="truncate">{relation.toEntity.name ?? relation.toEntity.id}</span>
          </Link>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            aria-expanded={false}
            onClick={() => {
              focusAfterExpandRef.current = true;
              setExpanded(true);
            }}
            className={`${META_CHIP_CLASS} text-grey-04 tabular-nums transition-colors hover:border-text hover:text-text`}
          >
            +{hidden}
          </button>
        )}
      </div>
    </section>
  );
}
