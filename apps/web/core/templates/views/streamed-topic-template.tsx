'use client';

import * as React from 'react';

import { QuerySeed, type QuerySeedEntry } from '~/core/query-seed';

import { LiveTopicTemplateView, type LiveTopicTemplateViewProps } from './live-topic-template-view';

type TopicTemplateSeed = { entityId: string; entries: Promise<QuerySeedEntry[]> };

const TopicTemplateSeedContext = React.createContext<TopicTemplateSeed | null>(null);

/**
 * Hands the Topic sections' server reads to the template without the page waiting for them.
 *
 * The route used to await these reads before rendering anything, so the whole page's first byte
 * waited on them. Now the page renders at once with the section skeletons in its HTML, and the
 * seeded sections stream into the same response as soon as the reads answer.
 */
export function TopicTemplateSeedProvider({
  entityId,
  entries,
  children,
}: {
  entityId: string;
  entries: Promise<QuerySeedEntry[]>;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ entityId, entries }), [entityId, entries]);
  return <TopicTemplateSeedContext.Provider value={value}>{children}</TopicTemplateSeedContext.Provider>;
}

/**
 * `LiveTopicTemplateView`, seeded from `TopicTemplateSeedProvider` when the page has a seed for this
 * Topic. Until the seed arrives, the fallback is the same view unseeded: header and title from the
 * entity store, sections as skeletons. During hydration React leaves a boundary that is still
 * streaming as server HTML, so the fallback never mounts in the browser on a full page load and
 * makes no client requests.
 *
 * Without a seed (the side panel, a Topic shown as a space's homepage, or another entity's panel
 * opened over this page) it is the plain view.
 */
export function StreamedLiveTopicTemplateView(props: LiveTopicTemplateViewProps) {
  const seed = React.useContext(TopicTemplateSeedContext);
  if (!seed || seed.entityId !== props.entityId || props.compact || props.embedded) {
    return <LiveTopicTemplateView {...props} />;
  }

  return (
    <React.Suspense fallback={<LiveTopicTemplateView {...props} />}>
      <SeededLiveTopicTemplateView entries={seed.entries} {...props} />
    </React.Suspense>
  );
}

function SeededLiveTopicTemplateView({
  entries,
  ...props
}: LiveTopicTemplateViewProps & { entries: Promise<QuerySeedEntry[]> }) {
  const seeded = React.use(entries);
  if (seeded.length === 0) return <LiveTopicTemplateView {...props} />;
  return (
    <QuerySeed entries={seeded}>
      <LiveTopicTemplateView {...props} />
    </QuerySeed>
  );
}
