'use client';

import * as React from 'react';

import Link from 'next/link';

import { sourcesIngestionLink } from '../adapters/source-ingestion-links';
import {
  type ClaimSummaryModel,
  type ClaimTopicPillModel,
  type EntityActionCallbacks,
  type EntityListSectionModel,
  type NewsStoryTemplateModel,
  formatPercentInt,
} from '../models';
import { resolveTemplateImageUrl } from '../ontology';
import {
  AddClaimPopover,
  ArrowUpRightIcon,
  EntityContextAndDisputes,
  EntityContextTogglePill,
  EntityInlineContext,
  EntityOverflowMenu,
  RelatedListSection,
  TEMPLATE_INTERACTIVE_CARD_SURFACE,
  TemplateBadge,
  TemplateShell,
  TemplateTitleRow,
  TopicImagePills,
  VoteBox,
} from '../primitives';

export interface NewsStoryTemplateProps {
  model: NewsStoryTemplateModel;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  actionCallbacks?: EntityActionCallbacks;
  compact?: boolean;
  /** Shows a calm skeleton below the Summary while claim groups and sources hydrate in one smooth reveal. */
  isLoadingSections?: boolean;
  className?: string;
  /** The story's space, which a Sources `+` import is picked from (GEO-3819). */
  spaceId?: string;
}

/**
 * Pure, data-driven News Story page template.
 *
 * Hybrid of Geo News's scannable editorial layout (cover, summary, ordered narrative claim groups,
 * right-hand graph rail for People involved / Related projects / Related entities / Broader timeline
 * / Topics) and Geo Genesis's crisp graph styling (circular-avatar pills, horizontal masonry Sources
 * rail, clickable Claim entities with inline agreement indicators, and side-by-side Context & Disputes).
 */
export function NewsStoryTemplate({
  model,
  headerActions,
  footer,
  actionCallbacks,
  compact = false,
  isLoadingSections = false,
  className,
  spaceId,
}: NewsStoryTemplateProps) {
  const [addedClaimsByGroup, setAddedClaimsByGroup] = React.useState<Record<string, ClaimSummaryModel[]>>({});

  const hasClaimGroups = Boolean(model.claimGroups && model.claimGroups.length > 0);
  const flatClaims = [...(addedClaimsByGroup['flat'] ?? []), ...model.reportedClaims];

  const hasPeople = Boolean(model.relatedPeople && model.relatedPeople.length > 0);
  const hasProjects = Boolean(model.relatedProjects && model.relatedProjects.length > 0);
  const hasEntities = Boolean(model.relatedEntities && model.relatedEntities.length > 0);
  const hasTopics = Boolean(model.topics && model.topics.length > 0);
  const hasTimelines = Boolean(model.associatedTimelines && model.associatedTimelines.length > 0);
  const hasSideRail = !compact && (hasPeople || hasProjects || hasEntities || hasTopics || hasTimelines);

  // Check if `model.sections` already includes a Sources section (e.g. Gaza fixture's Primary sources);
  // otherwise build a horizontally scrollable masonry Sources section from `model.sources`.
  const hasSourcesInSections = model.sections.some(sec => /source/i.test(sec.title) || sec.id === 'sources');
  const sourcesSection = React.useMemo<EntityListSectionModel | null>(() => {
    if (hasSourcesInSections) return null;
    const rawSources = model.sources ?? [];
    return {
      id: 'sources',
      title: 'Sources',
      layout: 'cards',
      emptyText: 'No sources',
      ingestionLink: sourcesIngestionLink(model.id, model.headline, spaceId),
      items: rawSources.map(source => ({
        id: source.id,
        kind: 'source',
        kindLabel: 'Source',
        mediaType: 'article',
        title: source.title,
        publisher: source.publication,
        meta: source.date,
        excerpt: source.excerpt,
        thumbnailUrl: source.thumbnailUrl ?? undefined,
        externalUrl: source.url,
        href: source.href,
        onSelect: source.onSelect,
      })),
    };
  }, [hasSourcesInSections, model.headline, model.id, model.sources, spaceId]);

  const sourceCount = model.sources?.length ?? 0;
  const resolvedCover = resolveTemplateImageUrl(model.coverUrl);

  const metaParts = [
    model.date,
    sourceCount > 0 ? `${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}` : undefined,
    model.authors && model.authors.length > 0 ? model.authors.join(', ') : undefined,
  ].filter(Boolean);

  return (
    <TemplateShell
      maxWidth={hasSideRail ? 1080 : 960}
      breadcrumbs={model.breadcrumbs}
      coverUrl={hasSideRail ? null : model.coverUrl}
      coverAlt={model.headline}
      compact={compact}
      contextByEntityId={model.contextByEntityId}
      actionCallbacks={actionCallbacks}
      className={className}
    >
      <div
        className={
          hasSideRail
            ? 'flex flex-col gap-10 @[920px]:flex-row @[920px]:items-start @[920px]:gap-10'
            : 'flex flex-col gap-10'
        }
      >
        {/* Main reading column */}
        <div className="flex min-w-0 flex-1 flex-col gap-9">
          {hasSideRail && resolvedCover && (
            <div className="rounded-2xl relative aspect-[3/1] w-full overflow-hidden bg-grey-01">
              <img src={resolvedCover} alt={model.headline} decoding="async" className="h-full w-full object-cover" />
            </div>
          )}

          {/* Editorial header: title first, type/metadata strip below */}
          <header className="flex flex-col gap-3.5">
            <TemplateTitleRow
              actions={
                <>
                  <EntityContextTogglePill />
                  {headerActions ?? (
                    <EntityOverflowMenu
                      target={{ id: model.id, kind: 'News story', title: model.headline }}
                      isPageRoot
                      size="md"
                    />
                  )}
                </>
              }
            >
              <h1 className="m-0 text-entityTitle text-pretty text-text">{model.headline}</h1>
            </TemplateTitleRow>

            <div className="flex flex-wrap items-center gap-2.5">
              <TemplateBadge tone="story">News story</TemplateBadge>

              {model.outlet && (
                <div className="flex items-center gap-2">
                  {model.outletInitials && (
                    <span
                      aria-hidden
                      className="inline-grid size-6 shrink-0 place-items-center rounded text-[11px] font-semibold tracking-tight text-white"
                      style={{ backgroundColor: model.outletColor ?? '#202020' }}
                    >
                      {model.outletInitials}
                    </span>
                  )}
                  <span className="text-[15px] font-semibold text-text">{model.outlet}</span>
                </div>
              )}

              {metaParts.length > 0 && <span className="text-[14.5px] text-grey-04">{metaParts.join(' · ')}</span>}

              {!hasSideRail &&
                model.associatedTimelines &&
                model.associatedTimelines.map(tl =>
                  tl.href ? (
                    <Link
                      key={tl.id}
                      href={tl.href}
                      className="inline-flex h-7 items-center rounded-md border border-divider bg-grey-01 px-2.5 text-[13.5px] font-medium text-text no-underline transition-colors hover:border-text hover:text-[#4c1fd4]"
                    >
                      {tl.title}
                    </Link>
                  ) : (
                    <TemplateBadge key={tl.id} tone="neutral">
                      {tl.title}
                    </TemplateBadge>
                  )
                )}
            </div>

            <EntityInlineContext targetId={model.id} targetTitle={model.headline} targetKind="News story" />

            {(model.externalUrl || model.archiveUrl) && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {model.externalUrl && (
                  <a
                    href={model.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-text bg-text px-5 text-button text-white no-underline transition-opacity hover:opacity-90"
                  >
                    <span>{model.outlet ? `Read on ${model.outlet}` : 'Read original article'}</span>
                    <ArrowUpRightIcon className="size-4" />
                  </a>
                )}
                {model.archiveUrl && (
                  <a
                    href={model.archiveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-grey-02 bg-white px-5 text-button text-text no-underline transition-colors hover:border-text"
                  >
                    <span>Archived copy</span>
                    <ArrowUpRightIcon className="size-4" />
                  </a>
                )}
              </div>
            )}
          </header>

          {/* Narrative summary (Geo News briefing prose) */}
          {model.summary && (
            <section aria-label="Summary" className="flex flex-col gap-2">
              <p className="m-0 text-[16.5px] leading-[27px] text-text/90">{model.summary}</p>
            </section>
          )}

          {isLoadingSections ? (
            <div aria-busy="true" aria-label="Loading story sections" className="flex flex-col gap-8">
              <div className="flex flex-col gap-3">
                <div className="h-6 w-48 animate-pulse rounded-md bg-grey-01" />
                <div className="h-4 w-full animate-pulse rounded bg-grey-01" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-grey-01" />
                <div className="h-4 w-4/5 animate-pulse rounded bg-grey-01" />
              </div>
              <div className="flex flex-col gap-3">
                <div className="h-6 w-28 animate-pulse rounded-md bg-grey-01" />
                <div className="grid grid-cols-1 gap-4 @[640px]:grid-cols-2">
                  <div className="h-32 animate-pulse rounded-xl bg-grey-01/80" />
                  <div className="h-32 animate-pulse rounded-xl bg-grey-01/80" />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex animate-fade-in flex-col gap-10">
              {/* Grouped narrative claims (Blocks / Perspectives) — scannable Geo News bulleted reading flow */}
              {hasClaimGroups ? (
                <div className="flex flex-col gap-8">
                  {model.claimGroups!.map(group => {
                    const claims = [...(addedClaimsByGroup[group.id] ?? []), ...group.claims];
                    return (
                      <section key={group.id} aria-label={group.title} className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex flex-col gap-1">
                            <h2 className="m-0 text-mediumTitle font-semibold text-text">{group.title}</h2>
                            {group.description && (
                              <p className="m-0 text-[15px] leading-[22px] text-grey-04">{group.description}</p>
                            )}
                          </div>
                          <AddClaimPopover
                            label={`Add claim to ${group.title}`}
                            onSubmit={draft => {
                              actionCallbacks?.onAddClaim?.(draft);
                              setAddedClaimsByGroup(prev => ({
                                ...prev,
                                [group.id]: [
                                  {
                                    id: `story-claim-${Date.now()}`,
                                    title: draft.title,
                                    kind: draft.kind,
                                    split: { rows: [], isSplit: false },
                                  },
                                  ...(prev[group.id] ?? []),
                                ],
                              }));
                            }}
                          />
                        </div>
                        <NewsClaimBulletList claims={claims} />
                      </section>
                    );
                  })}
                </div>
              ) : flatClaims.length > 0 ? (
                <section aria-label="Claims" className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="m-0 text-mediumTitle font-semibold text-text">Claims</h2>
                    <AddClaimPopover
                      label="Add claim"
                      onSubmit={draft => {
                        actionCallbacks?.onAddClaim?.(draft);
                        setAddedClaimsByGroup(prev => ({
                          ...prev,
                          flat: [
                            {
                              id: `story-claim-${Date.now()}`,
                              title: draft.title,
                              kind: draft.kind,
                              split: { rows: [], isSplit: false },
                            },
                            ...(prev.flat ?? []),
                          ],
                        }));
                      }}
                    />
                  </div>
                  <NewsClaimBulletList claims={flatClaims} />
                </section>
              ) : null}

              {/* Aggregated Sources in horizontally scrollable masonry layout */}
              {sourcesSection && <RelatedListSection section={sourcesSection} />}

              {model.accuracyRating && (
                <VoteBox
                  prompt={model.accuracyRating.prompt}
                  split={model.accuracyRating.split}
                  control={model.accuracyRating.voteBox}
                />
              )}

              {/* Compact / single-column fallback for Topics */}
              {!hasSideRail && hasTopics && <TopicImagePills topics={model.topics!} />}

              {model.sections.length > 0 && (
                <div className="flex flex-col gap-8">
                  {model.sections.map(section => (
                    <RelatedListSection key={section.id} section={section} />
                  ))}
                </div>
              )}

              {/* Context & Disputes side-by-side at the bottom of the page */}
              <EntityContextAndDisputes
                groups={model.graphConnections}
                target={{ id: model.id, kind: 'News story', title: model.headline }}
              />
            </div>
          )}
        </div>

        {/* Slim right-hand graph rail (sticky on wide containers, stacked cleanly on smaller screens) */}
        {hasSideRail && (
          <aside
            aria-label="Story connections"
            className="w-full border-t border-divider pt-8 @[920px]:sticky @[920px]:top-20 @[920px]:w-[288px] @[920px]:shrink-0 @[920px]:border-t-0 @[920px]:border-l @[920px]:pt-0 @[920px]:pl-7"
          >
            <div className="flex flex-col divide-y divide-divider">
              {hasTimelines && (
                <section aria-label="Broader timeline" className="flex flex-col gap-3 py-6 first:pt-0 last:pb-0">
                  <h2 className="m-0 text-[16px] leading-[22px] font-semibold tracking-[-0.01em] text-text">
                    {model.associatedTimelines!.length > 1 ? 'Broader timelines' : 'Broader timeline'}
                  </h2>
                  <div className="flex flex-col gap-2.5">
                    {model.associatedTimelines!.map(tl => (
                      <TimelineRailCard key={tl.id} timeline={tl} />
                    ))}
                  </div>
                </section>
              )}

              {hasPeople && (
                <div className="py-6 first:pt-0 last:pb-0">
                  <RailEntityCardList items={model.relatedPeople!} title="People involved" avatarShape="circle" />
                </div>
              )}

              {hasProjects && (
                <div className="py-6 first:pt-0 last:pb-0">
                  <RailEntityCardList items={model.relatedProjects!} title="Related projects" avatarShape="rounded" />
                </div>
              )}

              {hasEntities && (
                <div className="py-6 first:pt-0 last:pb-0">
                  <RailEntityCardList items={model.relatedEntities!} title="Related entities" avatarShape="rounded" />
                </div>
              )}

              {hasTopics && (
                <div className="py-6 first:pt-0 last:pb-0">
                  <TopicImagePills topics={model.topics!} title="Topics" density="rail" />
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {footer}
    </TemplateShell>
  );
}

const INITIAL_RAIL_CARDS = 6;

function RailEntityAvatar({
  label,
  imageUrl,
  shape,
}: {
  label: string;
  imageUrl?: string | null;
  shape: 'circle' | 'rounded';
}) {
  const resolved = resolveTemplateImageUrl(imageUrl);
  const [failed, setFailed] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [resolved]);

  const initial = label.trim()[0]?.toUpperCase() ?? '';
  const showImage = Boolean(resolved) && !failed;
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-xl';

  return (
    <span
      aria-hidden
      className={`relative inline-grid size-12 shrink-0 place-items-center overflow-hidden border border-black/[0.06] bg-grey-01 text-[16px] font-semibold text-grey-04 ${radius}`}
    >
      {(!showImage || !loaded) && <span>{initial}</span>}
      {showImage && (
        <img
          src={resolved ?? undefined}
          alt=""
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </span>
  );
}

/**
 * Renders a 2-column grid of visual entity cards with larger avatars when at least half
 * the items have images; otherwise falls back cleanly to compact circular-avatar pills.
 */
function RailEntityCardList({
  items,
  title,
  avatarShape,
}: {
  items: readonly ClaimTopicPillModel[];
  title: string;
  avatarShape: 'circle' | 'rounded';
}) {
  const [showAll, setShowAll] = React.useState(false);

  if (items.length === 0) return null;

  const imageCount = items.filter(item => Boolean(resolveTemplateImageUrl(item.imageUrl))).length;
  const useVisualCards = imageCount > 0 && imageCount >= Math.ceil(items.length / 2);

  if (!useVisualCards) {
    return <TopicImagePills topics={items} title={title} density="rail" />;
  }

  const visible = showAll ? items : items.slice(0, INITIAL_RAIL_CARDS);
  const hidden = Math.max(0, items.length - INITIAL_RAIL_CARDS);

  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="m-0 text-[16px] leading-[22px] font-semibold tracking-[-0.01em] text-text">{title}</h2>
      <div className="grid grid-cols-2 gap-2.5">
        {visible.map(item => {
          const cardContent = (
            <>
              <RailEntityAvatar label={item.label} imageUrl={item.imageUrl} shape={avatarShape} />
              <span className="line-clamp-2 text-[13.5px] leading-[17px] font-semibold text-text transition-colors group-hover:text-[#4c1fd4]">
                {item.label}
              </span>
            </>
          );

          const cardClasses = `group flex flex-col items-center justify-center gap-2.5 px-2.5 py-3.5 text-center no-underline ${TEMPLATE_INTERACTIVE_CARD_SURFACE}`;

          if (item.href) {
            return (
              <Link key={item.id} href={item.href} className={cardClasses}>
                {cardContent}
              </Link>
            );
          }

          if (item.onSelect) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onSelect}
                className={`cursor-pointer border-0 ${cardClasses}`}
              >
                {cardContent}
              </button>
            );
          }

          return (
            <div key={item.id} className={cardClasses}>
              {cardContent}
            </div>
          );
        })}
      </div>

      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll(prev => !prev)}
          className="cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] font-medium text-grey-04 transition-colors hover:text-text"
        >
          {showAll ? 'Show less' : `Show ${hidden} more`}
        </button>
      )}
    </section>
  );
}

function TimelineRailCard({
  timeline,
}: {
  timeline: { id: string; title: string; coverUrl?: string | null; href?: string };
}) {
  const cover = resolveTemplateImageUrl(timeline.coverUrl);

  const inner = cover ? (
    <div className="relative overflow-hidden rounded-xl bg-text px-4 py-4 text-white transition-transform duration-150 group-hover:scale-[1.01]">
      <img
        src={cover}
        alt=""
        aria-hidden
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover opacity-55 transition-opacity group-hover:opacity-65"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/15" />
      <div className="relative flex flex-col gap-1">
        <span className="text-[11.5px] font-medium text-white/80">Timeline</span>
        <span className="text-[15px] leading-[20px] font-semibold text-white group-hover:underline">
          {timeline.title}
        </span>
      </div>
    </div>
  ) : (
    <div className="flex flex-col gap-1 rounded-xl border border-grey-02 bg-grey-01/50 px-3.5 py-3 transition-colors group-hover:border-text group-hover:bg-white">
      <span className="text-[11.5px] font-medium text-grey-04">Timeline</span>
      <span className="text-[14.5px] leading-[20px] font-semibold text-text group-hover:text-[#4c1fd4]">
        {timeline.title}
      </span>
    </div>
  );

  if (timeline.href) {
    return (
      <Link href={timeline.href} className="group block no-underline">
        {inner}
      </Link>
    );
  }

  return <div className="group">{inner}</div>;
}

/**
 * Geo News-style editorial bulleted claims list, enhanced with Geo Genesis graph links,
 * subtle inline vote agreement indicators when voted, and inline Context / Flags overflow.
 */
function NewsClaimBulletList({ claims }: { claims: readonly ClaimSummaryModel[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {claims.map(claim => {
        const hasAgreement = claim.overallPercent !== undefined && (claim.split.totalVotes ?? 0) > 0;
        return (
          <li key={claim.id} className="group/claim-bullet flex flex-col gap-1.5">
            <div className="flex items-start gap-3">
              <span aria-hidden className="mt-[9px] inline-block size-[5px] shrink-0 rounded-[1px] bg-text" />
              <div className="min-w-0 flex-1 text-[16px] leading-[25px] text-text">
                {claim.href ? (
                  <Link href={claim.href} className="text-text no-underline transition-colors hover:text-[#4c1fd4]">
                    {claim.title}
                  </Link>
                ) : claim.onSelect ? (
                  <button
                    type="button"
                    onClick={claim.onSelect}
                    className="cursor-pointer border-0 bg-transparent p-0 text-left text-[16px] leading-[25px] text-text transition-colors hover:text-[#4c1fd4]"
                  >
                    {claim.title}
                  </button>
                ) : (
                  <span>{claim.title}</span>
                )}

                {hasAgreement && (
                  <span className="ml-2 inline-flex items-center rounded-md border border-divider bg-grey-01 px-1.5 py-0.5 align-middle text-[12px] leading-none font-medium text-grey-04 tabular-nums">
                    {formatPercentInt(claim.overallPercent!)} agree
                  </span>
                )}
              </div>

              <div className="shrink-0 opacity-60 transition-opacity group-focus-within/claim-bullet:opacity-100 group-hover/claim-bullet:opacity-100">
                <EntityOverflowMenu target={{ id: claim.id, kind: 'Claim', title: claim.title }} />
              </div>
            </div>

            <EntityInlineContext
              targetId={claim.id}
              targetTitle={claim.title}
              targetKind="Claim"
              className="pl-[17px]"
            />
          </li>
        );
      })}
    </ul>
  );
}
