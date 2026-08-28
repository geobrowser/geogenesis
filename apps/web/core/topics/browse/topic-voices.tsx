'use client';

import * as React from 'react';

import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import { GUESTS_PROPERTY_ID, HOSTS_PROPERTY_ID } from '../ontology';
import { useTopicLinkedEntities } from './use-topic-linked-entities';

/** How many episodes are read to build the list, and how many people it shows. */
const EPISODES_SAMPLED = 50;
const MAX_VOICES = 12;

type Voice = { id: string; name: string | null; hostOf: number; guestOf: number };

/**
 * The people talking about this topic, derived from the material that names it.
 *
 * People carry no `Topics` relation — measured across a thousand topic links, `Person` appears
 * once. A section built on a direct relation would be empty on essentially every topic. What does
 * exist is one hop further out: episodes name the topic, and episodes name their `Hosts` and
 * `Guests`. On `U.S. elections` that path yields 20 host links and 12 guest links across 60
 * episodes, so it produces a real list rather than a token one.
 *
 * Called "Voices" rather than "People" for the same reason: this is who is talking about the topic,
 * which is what the derivation supports. "People" would imply a curated roster that doesn't exist.
 *
 * Ranked by how often someone appears, so the list leads with the topic's regulars rather than
 * whoever happened to be on the most recent episode.
 */
export function TopicVoices({ topicId, spaceId }: { topicId: string; spaceId: string }) {
  // A sample rather than the whole corpus. This is a summary, and paging every episode on a topic
  // with 150 of them to refine an ordering by appearance count would cost far more than the
  // precision is worth. Deliberately not paged for the same reason — see the note below.
  const { entities: sources, isLoading } = useTopicLinkedEntities({ topicId, first: EPISODES_SAMPLED });

  const counts = React.useMemo(() => {
    const byPerson = new Map<string, Voice>();

    for (const source of sources) {
      for (const relation of source.relations) {
        if (relation.isDeleted === true) continue;
        const isHost = ID.equals(relation.type.id, HOSTS_PROPERTY_ID);
        const isGuest = ID.equals(relation.type.id, GUESTS_PROPERTY_ID);
        if (!isHost && !isGuest) continue;

        const id = relation.toEntity.id;
        const voice = byPerson.get(id) ?? { id, name: relation.toEntity.name, hostOf: 0, guestOf: 0 };
        if (isHost) voice.hostOf += 1;
        else voice.guestOf += 1;
        // A later relation may carry the name an earlier one lacked.
        voice.name = voice.name ?? relation.toEntity.name;
        byPerson.set(id, voice);
      }
    }

    return [...byPerson.values()]
      .sort((a, b) => b.hostOf + b.guestOf - (a.hostOf + a.guestOf) || a.id.localeCompare(b.id))
      .slice(0, MAX_VOICES);
  }, [sources]);

  const personIds = React.useMemo(() => counts.map(voice => voice.id), [counts]);
  // Names ride the relation, but avatars don't — the person entities carry those.
  const { entities: people } = useQueryEntities({
    where: { id: { in: personIds } },
    first: personIds.length || 1,
    enabled: personIds.length > 0,
  });
  const personById = React.useMemo(() => new Map(people.map(person => [ID.uuidToHex(person.id), person])), [people]);

  if (isLoading || counts.length === 0) return null;

  return (
    <section aria-label="Voices on this topic">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Text as="h2" variant="smallTitle" color="text">
          Voices on this topic
        </Text>
        <Text as="span" variant="metadata" color="grey-04" className="tabular-nums">
          {/* Says what the list was built from, because it is a derivation rather than a stored set
              and a reader should be able to tell. */}
          From {sources.length} recent {sources.length === 1 ? 'item' : 'items'}
        </Text>
      </div>
      <div className="flex flex-wrap gap-2">
        {counts.map(voice => (
          <VoiceChip
            key={voice.id}
            voice={voice}
            person={personById.get(ID.uuidToHex(voice.id)) ?? null}
            spaceId={spaceId}
          />
        ))}
      </div>
    </section>
  );
}

function VoiceChip({ voice, person, spaceId }: { voice: Voice; person: Entity | null; spaceId: string }) {
  const appearances = voice.hostOf + voice.guestOf;
  // Whichever role they mostly hold on this topic, rather than both — a chip has room for one.
  const role = voice.hostOf >= voice.guestOf ? 'host' : 'guest';
  const name = voice.name ?? person?.name;

  if (!name) return null;

  return (
    <Link
      href={NavUtils.toEntity(person?.spaces[0] ?? spaceId, voice.id)}
      className="flex items-center gap-2 rounded-full border border-grey-02 bg-white py-1 pr-3 pl-1 transition-colors hover:border-grey-03"
    >
      <span className="block size-6 shrink-0 overflow-hidden rounded-full bg-grey-02">
        <Avatar value={voice.id} size={24} />
      </span>
      <Text as="span" variant="metadataMedium" color="text">
        {name}
      </Text>
      <Text as="span" variant="footnote" color="grey-04" className="tabular-nums">
        {role} · {appearances}
      </Text>
    </Link>
  );
}
