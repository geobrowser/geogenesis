'use client';

import * as React from 'react';

import { type ClaimAbout, nodeClaimSpaceId } from '~/core/graph-explorer/claims-about';
import { type GraphNode, HOP1_PER_KIND } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import type { GraphCentre } from '~/core/graph-explorer/graph-entity';
import { useGraphAnalytics } from '~/core/graph-explorer/graph-explorer-analytics';
import { GRAPH_KIND_TYPE_IDS, type GraphKind } from '~/core/graph-explorer/graph-kinds';
import { groupByKind } from '~/core/graph-explorer/panel-sections';
import type { Spoke } from '~/core/graph-explorer/spokes';
import { normId } from '~/core/utils/norm-id';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { nodeDateLabel, nodeTypeLabel } from './connections/node-card';
import { EntityAvatar } from './entity-avatar';
import { NeighbourGroups, type PanelClaim } from './panel-sections';

/** `claims` null: claims aren't asked for here (a chip other than Claims), so there's nothing to report. */
export type EntityPanelEmptyMessages = { relationships: string; claims: string | null };

export function typeNames(entity: { types: Array<{ name: string | null }> }): string[] {
  return [...new Set(entity.types.map(type => type.name).filter((name): name is string => Boolean(name)))];
}

/** The kind's own word, first on the line above the title as in the prototype. People and groups have none: their type says it. */
const KIND_EYEBROW: Partial<Record<GraphKind, string>> = {
  topic: 'Topic',
  claim: 'Claim',
  story: 'News',
  event: 'Event',
  src: 'Source',
  case: 'Court case',
};

export type PanelCentre = GraphCentre & Pick<GraphNode, 'kind' | 'date'>;

/**
 * The line above the centre's title, in the prototype's form: the kind, then its types (best first),
 * then its date, joined with " · " ("Source · Dataset · Nov 15, 2026"). A type a kind is made of
 * alone ("Claim", "News story") is the kind's word already, so it isn't said twice.
 */
export function centreEyebrow(centre: PanelCentre): string | null {
  const kindWord = KIND_EYEBROW[centre.kind];
  const kindTypeIds = GRAPH_KIND_TYPE_IDS[centre.kind];
  const sole = kindTypeIds.length === 1 ? kindTypeIds[0] : null;
  const names = centre.types
    .filter(type => normId(type.id) !== sole)
    .map(type => type.name)
    .filter((name): name is string => Boolean(name));
  const best = nodeTypeLabel(centre);
  const types = [...new Set([...(best && names.includes(best) ? [best] : []), ...names])].filter(
    name => name.toLowerCase() !== kindWord?.toLowerCase()
  );
  return [kindWord, ...types, nodeDateLabel(centre)].filter(Boolean).join(' · ') || null;
}

export type ClaimsState = {
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
};

/**
 * The panel beside the map: the centre, its description, its summary (vote box or topic overview)
 * and everything around it grouped by kind. On phones it is the sheet under the map.
 */
export function EntityPanel({
  centre,
  pageSpaceId,
  topicSpaceId,
  spokes,
  nodes,
  claimPages,
  claimsState,
  onOpen,
  moreKinds,
  emptyMessages,
  summary,
  summaryFirst = false,
  showClaims = true,
}: {
  centre: PanelCentre;
  /** The space whose page for the centre its title links to; null, a plain title. */
  pageSpaceId: string | null;
  topicSpaceId: string | null;
  spokes: Spoke[];
  /** Hop-1 nodes by id, for each spoke's kind and date. */
  nodes: ReadonlyMap<string, GraphNode>;
  /** Claims about the centre, one array per loaded page. */
  claimPages: ClaimAbout[][];
  claimsState: ClaimsState;
  onOpen: (id: string, name: string | null) => void;
  /** Kinds with more around the centre than were loaded. */
  moreKinds: readonly GraphKind[];
  emptyMessages: EntityPanelEmptyMessages;
  /** The vote box (above the description, for a claim), or a topic's summary and overview (under it). */
  summary?: React.ReactNode;
  /** True for a claim centre: its vote block goes above the description rather than under it. */
  summaryFirst?: boolean;
  /** False for a claim centre, whose related claims are already among its relations. */
  showClaims?: boolean;
}) {
  const groups = React.useMemo(() => groupByKind(spokes, nodes), [spokes, nodes]);
  const claims = React.useMemo(
    () => panelClaims(showClaims ? claimPages : [], groups, nodes, topicSpaceId),
    [showClaims, claimPages, groups, nodes, topicSpaceId]
  );

  return (
    <section aria-label={`About ${centre.name ?? centre.id}`} className="flex min-h-0 flex-col gap-5">
      <CentreHeader centre={centre} pageSpaceId={pageSpaceId} />

      {/* A claim's vote block comes before its description, so Agree and Disagree are on screen
          without scrolling however long the description runs (GEO-3841). Its own prop rather than
          `!showClaims`: that one is about the claims list, and a filter hiding it must not lift a
          topic's summary above its description. */}
      {summaryFirst && summary}

      {/* No description, nothing: an empty-state line here only pushed the relations down. */}
      {centre.description && (
        <p className="text-[14px] leading-[1.45] whitespace-pre-line text-grey-05">{centre.description}</p>
      )}

      {!summaryFirst && summary}

      <NeighbourGroups
        groups={groups}
        claims={claims}
        claimsState={showClaims ? claimsState : NO_CLAIMS_ASKED}
        moreKinds={moreKinds}
        emptyMessage={emptyMessages.relationships}
        claimsEmptyMessage={showClaims ? emptyMessages.claims : null}
        onOpen={onOpen}
      />
      {moreKinds.length > 0 && (
        <p className="text-metadata text-grey-04">Showing the first {HOP1_PER_KIND} of each kind in each direction.</p>
      )}
    </section>
  );
}

/** No claims asked about the centre: nothing loading, nothing to report. */
export const NO_CLAIMS_ASKED: ClaimsState = {
  isLoading: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: () => {},
};

/**
 * Claims about the centre, then claims linked to it some other way that are on the map, each in
 * its own space. A claim linked both ways is listed once, with its relation.
 */
export function panelClaims(
  pages: readonly ClaimAbout[][],
  groups: ReturnType<typeof groupByKind>,
  nodes: ReadonlyMap<string, GraphNode>,
  topicSpaceId: string | null = null
): PanelClaim[] {
  const byId = new Map<string, PanelClaim>();
  for (const claim of pages.flat())
    byId.set(normId(claim.id), { id: claim.id, name: claim.name, spaceId: claim.spaceId });
  const linked = groups.find(group => group.kind === 'claim')?.spokes ?? [];
  for (const { spoke } of linked) {
    const id = normId(spoke.entity.id);
    const existing = byId.get(id);
    if (existing) {
      existing.relation = spoke.labels.join(' · ');
      continue;
    }
    const node = nodes.get(id);
    const spaceId = node ? nodeClaimSpaceId(node, topicSpaceId) : spoke.nodeSpaceId;
    if (spaceId && spoke.entity.name)
      byId.set(id, { id: spoke.entity.id, name: spoke.entity.name, spaceId, relation: spoke.labels.join(' · ') });
  }
  return [...byId.values()];
}

/**
 * The prototype's header for every kind: picture (when there is one), the kind and types line, then
 * the title, which is the link to the centre's page with an arrow after it.
 */
function CentreHeader({ centre, pageSpaceId }: { centre: PanelCentre; pageSpaceId: string | null }) {
  const analytics = useGraphAnalytics();
  const eyebrow = centreEyebrow(centre);
  const name = centre.name ?? centre.id;
  return (
    <header className="flex items-center gap-3">
      <EntityAvatar entity={centre} />
      <div className="flex min-w-0 flex-col gap-0.5">
        {eyebrow && <p className="text-[13px] leading-[1.35] text-grey-04">{eyebrow}</p>}
        <h2 className="text-[20px] leading-[1.25] font-semibold tracking-[-0.03em] wrap-break-word text-text">
          {pageSpaceId ? (
            <Link
              href={NavUtils.toEntity(pageSpaceId, centre.id)}
              onClick={() =>
                analytics?.interacted({
                  interaction: 'open_page',
                  value: centre.kind === 'claim' ? 'claim' : 'entity',
                  target_id: centre.id,
                })
              }
              className="rounded-[4px] decoration-grey-03 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
            >
              {name}
              <span aria-hidden className="font-medium text-[#8b8b8b]">
                {' →'}
              </span>
            </Link>
          ) : (
            name
          )}
        </h2>
      </div>
    </header>
  );
}
