'use client';

import * as React from 'react';

import { type ClaimAbout, nodeClaimSpaceId } from '~/core/graph-explorer/claims-about';
import { type GraphNode, HOP1_PER_KIND } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import type { GraphCentre } from '~/core/graph-explorer/graph-entity';
import type { GraphKind } from '~/core/graph-explorer/graph-kinds';
import { groupByKind } from '~/core/graph-explorer/panel-sections';
import type { Spoke } from '~/core/graph-explorer/spokes';
import { normId } from '~/core/utils/norm-id';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { EntityAvatar } from './entity-avatar';
import { NeighbourGroups, type PanelClaim } from './panel-sections';

export type EntityPanelEmptyMessages = { relationships: string; claims: string; description: string };

export function typeNames(entity: { types: Array<{ name: string | null }> }): string[] {
  return [...new Set(entity.types.map(type => type.name).filter((name): name is string => Boolean(name)))];
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
  centreSpaceId,
  topicSpaceId,
  spokes,
  nodes,
  claimPages,
  claimsState,
  onOpen,
  moreKinds,
  emptyMessages,
  summary,
  showClaims = true,
}: {
  centre: GraphCentre;
  centreSpaceId: string | null;
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
  /** Shown under the description: the vote box, or a topic's summary and overview. */
  summary?: React.ReactNode;
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
      <div className="flex items-start gap-3">
        <EntityAvatar entity={centre} size={48} />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-mediumTitle wrap-break-word text-text">{centre.name ?? centre.id}</h2>
          <div className="flex flex-wrap gap-1">
            {typeNames(centre).map(name => (
              <span key={name} className="rounded border border-grey-02 px-1.5 text-footnote text-grey-04">
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <Details
        centre={centre}
        centreSpaceId={showClaims ? centreSpaceId : null}
        emptyMessage={emptyMessages.description}
      />

      {summary}

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

const NO_CLAIMS_ASKED: ClaimsState = {
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

function Details({
  centre,
  centreSpaceId,
  emptyMessage,
}: {
  centre: GraphCentre;
  centreSpaceId: string | null;
  emptyMessage: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {centre.description ? (
        <p className="text-body whitespace-pre-line text-text">{centre.description}</p>
      ) : (
        <p className="text-body text-grey-04">{emptyMessage}</p>
      )}
      {/* A claim's own link sits with its vote box. */}
      {centreSpaceId && (
        <Link
          href={NavUtils.toEntity(centreSpaceId, centre.id)}
          className="self-start text-metadataMedium text-text underline-offset-2 hover:underline"
        >
          Open page →
        </Link>
      )}
    </div>
  );
}
