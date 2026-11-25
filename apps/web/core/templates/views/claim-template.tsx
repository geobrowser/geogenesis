'use client';

import * as React from 'react';

import { ActionContextProvider } from '~/core/action-context-provider';
import { NavUtils } from '~/core/utils/utils';

import {
  type ClaimKind,
  type ClaimTemplateModel,
  type EntityActionCallbacks,
  type StrongestCaseModel,
  type SubClaimModel,
  formatClaimKindLabel,
  formatCompactCount,
} from '../models';
import {
  AddClaimPopover,
  CheckCircleIcon,
  ClaimListRow,
  EntityContextAndDisputes,
  EntityContextTogglePill,
  EntityInlineContext,
  EntityOverflowMenu,
  InlinePagination,
  ListRankingHeaderControl,
  ListRankingWorkspace,
  type RankableListItem,
  RecentDebatesGallery,
  RelatedListSection,
  SourceChipList,
  TEMPLATE_CARD_SURFACE,
  TemplateBadge,
  type TemplateBadgeTone,
  TemplateShell,
  TemplateTitleRow,
  TemplateVoteRows,
  TopicImagePills,
  VoteBox,
  useListRanking,
} from '../primitives';
import { PUBLISHING_LABEL, usePendingAdds } from '../primitives/use-pending-adds';

// Gray for every kind (GEO-3845).
const CLAIM_KIND_TONE: Record<ClaimKind, TemplateBadgeTone> = {
  fact: 'neutral',
  judgment: 'neutral',
  'value-judgment': 'neutral',
};

export interface ClaimTemplateProps {
  model: ClaimTemplateModel;
  /** Optional header actions slot (e.g. share, overflow menu, history on live Geo pages). */
  headerActions?: React.ReactNode;
  /** Live GRC-20 persistence & search callbacks. */
  actionCallbacks?: EntityActionCallbacks;
  /** Compact density when rendered inside the narrow entity side panel. */
  compact?: boolean;
  /** Shows a calm skeleton below the VoteBox while async live sections coalesce in one smooth reveal. */
  isLoadingSections?: boolean;
  className?: string;
}

/**
 * Pure, data-driven Claim page template.
 *
 * Mirrors Geo's GRC-20 Claim ontology: every assertion is a `Claim` with a stored epistemic
 * property (`Factual` / `Judgment` / `Value judgment`), while agreement state (`Where they split`
 * vs `Common ground`) is computed dynamically from community vote splits and shown in the bars.
 */
export function ClaimTemplate({
  model,
  headerActions,
  actionCallbacks,
  compact = false,
  isLoadingSections = false,
  className,
}: ClaimTemplateProps) {
  return (
    <TemplateShell
      maxWidth={980}
      breadcrumbs={model.breadcrumbs}
      coverUrl={model.coverUrl}
      coverAlt={model.title}
      compact={compact}
      contextByEntityId={model.contextByEntityId}
      actionCallbacks={actionCallbacks}
      className={className}
    >
      {/* Header (name first, type labels below) */}
      <header className="flex flex-col gap-3.5">
        <TemplateTitleRow
          meta={
            <>
              <TemplateBadge tone="neutral">Claim</TemplateBadge>
              <TemplateBadge tone={CLAIM_KIND_TONE[model.kind]}>{formatClaimKindLabel(model.kind)}</TemplateBadge>
            </>
          }
          actions={
            <>
              <EntityContextTogglePill />
              {headerActions ?? (
                <EntityOverflowMenu target={{ id: model.id, kind: 'Claim', title: model.title }} isPageRoot size="md" />
              )}
            </>
          }
        >
          <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>
        </TemplateTitleRow>

        <EntityInlineContext targetId={model.id} targetTitle={model.title} targetKind="Claim" />
      </header>

      {/* Vote box + community split bars */}
      <VoteBox split={model.split} control={model.voteBox} />

      {isLoadingSections ? (
        <div aria-busy="true" aria-label="Loading claim sections" className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <div className="h-6 w-44 animate-pulse rounded-md bg-grey-01" />
            <div className={`flex flex-col divide-y divide-divider overflow-hidden ${TEMPLATE_CARD_SURFACE}`}>
              {Array.from({ length: 4 }, (_, idx) => (
                <div key={idx} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-grey-01" />
                    <div className="h-6 w-48 animate-pulse rounded-full bg-grey-01" />
                  </div>
                  <div className="hidden h-3 w-44 animate-pulse rounded-full bg-grey-01 @[760px]:block" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="h-6 w-28 animate-pulse rounded-md bg-grey-01" />
            <div className="grid grid-cols-1 gap-4 @[640px]:grid-cols-3">
              {Array.from({ length: 3 }, (_, idx) => (
                <div key={idx} className={`h-[320px] animate-pulse ${TEMPLATE_CARD_SURFACE} bg-grey-01/60`} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex animate-fade-in flex-col gap-10">
          {/* Accepted basis (clean soft-shadow editorial panel) */}
          {model.agreedBasis && (
            <section aria-label="Accepted" className={`flex flex-col gap-4 p-5 @[560px]:p-6 ${TEMPLATE_CARD_SURFACE}`}>
              <div className="flex items-center gap-2 text-ctaPrimary">
                <CheckCircleIcon className="size-5" />
                <h2 className="m-0 text-smallTitle text-text">Accepted</h2>
              </div>
              <p className="m-0 text-[15.5px] leading-[24px] text-text/85">{model.agreedBasis.summary}</p>
              {model.agreedBasis.settlingSources.length > 0 && (
                <div className="flex flex-col gap-2.5 border-t border-divider pt-4">
                  <span className="text-[14px] font-medium text-grey-04">Primary sources</span>
                  <SourceChipList sources={model.agreedBasis.settlingSources} />
                </div>
              )}
            </section>
          )}

          {/* Key stat callout */}
          {model.keyStat && (
            <section aria-label="Key evidence" className={`flex flex-col gap-3 p-5 ${TEMPLATE_CARD_SURFACE}`}>
              <p className="m-0 text-[15.5px] leading-[24px] text-text">{model.keyStat.text}</p>
              <SourceChipList sources={model.keyStat.sources} />
            </section>
          )}

          {/* Supporting, Opposing, and Related claims (prominent, with Topic-style vote actions & bars) */}
          {model.subClaims && model.subClaims.length > 0 && (
            <GroupedSubClaimSections
              subClaims={model.subClaims}
              onAddClaim={actionCallbacks?.onAddClaim}
              canOpenAddForm={actionCallbacks?.canOpenAddForm}
            />
          )}

          {/* Strongest cases */}
          {model.strongestCases && model.strongestCases.length > 0 && (
            <section aria-label="Strongest cases" className="flex flex-col gap-4">
              <h2 className="m-0 text-mediumTitle font-semibold text-text">Strongest cases</h2>
              <div className="grid grid-cols-1 gap-4 @[640px]:grid-cols-2">
                {model.strongestCases.map(item => (
                  <StrongestCaseCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}

          {/* Debates gallery row with debate cards */}
          {model.debates && model.debates.length > 0 && (
            <RecentDebatesGallery
              debates={model.debates}
              title="Debates"
              seeAllHref={model.debatesHref}
              onSeeAll={model.onOpenDebates}
            />
          )}

          {/* Topics pills with circular thumbnail images */}
          {model.topics && model.topics.length > 0 && <TopicImagePills topics={model.topics} />}

          {/* Related entity lists (Parent claim, Supporting quotes, Sources, More claims in this topic) */}
          {model.sections.length > 0 && (
            <div className="flex flex-col gap-8">
              {model.sections.map(section => (
                <RelatedListSection key={section.id} section={section} />
              ))}
            </div>
          )}

          {/* Context relations & Disputes side-by-side at the bottom of the page */}
          <EntityContextAndDisputes
            groups={model.graphConnections}
            target={{ id: model.id, kind: 'Claim', title: model.title }}
          />
        </div>
      )}
    </TemplateShell>
  );
}

const SUBCLAIMS_PER_PAGE = 6;

function GroupedSubClaimSections({
  subClaims,
  onAddClaim,
  canOpenAddForm,
}: {
  subClaims: readonly SubClaimModel[];
  onAddClaim?: EntityActionCallbacks['onAddClaim'];
  canOpenAddForm?: EntityActionCallbacks['canOpenAddForm'];
}) {
  const listedIds = React.useMemo(() => subClaims.map(claim => claim.id), [subClaims]);
  const added = usePendingAdds<SubClaimModel>(listedIds);
  const [pagesBySection, setPagesBySection] = React.useState<Record<string, number>>({});
  const combined = [...subClaims, ...added.rows];

  const sections = [
    {
      id: 'supporting-claims',
      title: 'Supporting claims',
      addLabel: 'Add supporting claim',
      stance: 'supports' as const,
      items: combined.filter(c => c.stance === 'supports'),
    },
    {
      id: 'opposing-claims',
      title: 'Opposing claims',
      addLabel: 'Add opposing claim',
      stance: 'opposes' as const,
      items: combined.filter(c => c.stance === 'opposes'),
    },
    {
      id: 'related-claims',
      title: 'Related claims',
      addLabel: 'Add related claim',
      stance: 'addresses' as const,
      items: combined.filter(c => c.stance !== 'supports' && c.stance !== 'opposes'),
    },
  ].filter(section => section.items.length > 0);

  return (
    <>
      {sections.map(section => (
        <SubClaimGroupSection
          key={section.id}
          section={section}
          page={pagesBySection[section.id] ?? 1}
          onPageChange={next => setPagesBySection(prev => ({ ...prev, [section.id]: next }))}
          canOpenAddForm={canOpenAddForm}
          onAddClaim={draft => {
            added.add(
              state => ({
                pending: state.status === 'pending',
                title: draft.title,
                kind: draft.kind,
                stance: section.stance,
                stat: state.status === 'pending' ? PUBLISHING_LABEL : draft.note,
                split: { rows: [], isSplit: false },
                sources: [],
                href: state.status === 'published' ? NavUtils.toEntity(state.spaceId, state.id) : undefined,
              }),
              onAddClaim?.({ ...draft, stance: section.stance })
            );
            setPagesBySection(prev => ({ ...prev, [section.id]: 1 }));
          }}
        />
      ))}
    </>
  );
}

function SubClaimGroupSection({
  section,
  page,
  onPageChange,
  onAddClaim,
  canOpenAddForm,
}: {
  section: {
    id: string;
    title: string;
    addLabel: string;
    stance: 'supports' | 'opposes' | 'addresses';
    items: readonly SubClaimModel[];
  };
  page: number;
  onPageChange: (next: number) => void;
  onAddClaim: (draft: { title: string; kind: ClaimKind; note?: string }) => void;
  canOpenAddForm?: () => boolean;
}) {
  const rankingKey = React.useMemo(() => {
    const sig = section.items
      .slice(0, 3)
      .map(c => c.id)
      .join(',');
    return `subclaims:${section.id}:${sig}`;
  }, [section.id, section.items]);

  const ranking = useListRanking({ listKey: rankingKey, items: section.items });

  const rankableItems = React.useMemo<RankableListItem[]>(
    () =>
      section.items.map(subClaim => ({
        id: subClaim.id,
        title: subClaim.title,
        badge: subClaim.kind ? formatClaimKindLabel(subClaim.kind) : undefined,
        badgeTone: subClaim.kind ? CLAIM_KIND_TONE[subClaim.kind] : 'neutral',
        meta:
          subClaim.split.totalVotes && subClaim.split.totalVotes > 0
            ? `${formatCompactCount(subClaim.split.totalVotes)} ${subClaim.split.totalVotes === 1 ? 'vote' : 'votes'}`
            : undefined,
      })),
    [section.items]
  );

  const orderedItems = ranking.orderedItems;
  const totalPages = Math.max(1, Math.ceil(orderedItems.length / SUBCLAIMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * SUBCLAIMS_PER_PAGE;
  const visibleItems = orderedItems.slice(startIndex, startIndex + SUBCLAIMS_PER_PAGE);

  return (
    <section aria-label={section.title} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-mediumTitle font-semibold text-text">{section.title}</h2>
        <div className="flex items-center gap-1">
          <ListRankingHeaderControl
            title={section.title}
            hasMyRanking={ranking.hasMyRanking}
            viewMode={ranking.viewMode}
            onViewModeChange={mode => {
              ranking.setViewMode(mode);
              onPageChange(1);
            }}
            onOpen={ranking.open}
            disabled={section.items.length < 2}
          />
          <AddClaimPopover label={section.addLabel} onSubmit={onAddClaim} canOpen={canOpenAddForm} />
        </div>
      </div>

      <ListRankingWorkspace
        open={ranking.isOpen}
        title={section.title}
        items={rankableItems}
        initialOrder={ranking.myOrder}
        onClose={ranking.close}
        onPublish={nextOrder => {
          ranking.publish(nextOrder);
          onPageChange(1);
        }}
      />

      <div className={`divide-y divide-divider overflow-hidden ${TEMPLATE_CARD_SURFACE}`}>
        {/* Every page's sub-claims, so paging keeps the same lookup and batch. */}
        <TemplateVoteRows targets={orderedItems.map(subClaim => subClaim.voteTarget)}>
          {visibleItems.map((subClaim, idx) => (
            // Names the list, the group (positions restart in each) and the row on every action taken
            // in it, a vote included.
            <ActionContextProvider
              key={subClaim.id}
              value={{
                list_id: 'template_sub_claims',
                list_section_id: section.stance,
                item_position: startIndex + idx + 1,
              }}
            >
              <SubClaimRow rank={startIndex + idx + 1} subClaim={subClaim} />
            </ActionContextProvider>
          ))}
        </TemplateVoteRows>
        {totalPages > 1 && (
          <div className="px-5 py-3">
            <InlinePagination
              page={safePage}
              totalPages={totalPages}
              onPageChange={onPageChange}
              label={`${section.title} pages`}
              className="pt-0"
            />
          </div>
        )}
      </div>
    </section>
  );
}

/** A sub-claim drawn as the Topic page draws its claims, with its note and sources under the votes. */
function SubClaimRow({ rank, subClaim }: { rank: number; subClaim: SubClaimModel }) {
  const details =
    subClaim.stat || subClaim.sources.length > 0 ? (
      <>
        {subClaim.stat && <p className="m-0 text-[14.5px] leading-[21px] text-grey-04">{subClaim.stat}</p>}
        {subClaim.sources.length > 0 && <SourceChipList sources={subClaim.sources} />}
      </>
    ) : undefined;

  return <ClaimListRow rank={rank} claim={subClaim} details={details} />;
}

function StrongestCaseCard({ item }: { item: StrongestCaseModel }) {
  return (
    <article
      className={`relative flex flex-col justify-between gap-4 overflow-hidden p-5 @[560px]:p-6 ${TEMPLATE_CARD_SURFACE}`}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: item.accentColor }} />
      <div className="flex flex-col gap-3.5 pt-0.5">
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden
            className="mt-2 inline-block size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.accentColor }}
          />
          <h3 className="m-0 text-[18px] leading-[24px] font-semibold text-text">{item.title}</h3>
        </div>

        {item.points.length > 0 && (
          <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-[15px] leading-[23px] text-text/85">
            {item.points.map(point => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {item.concede && (
          <div className="flex flex-col gap-1 rounded-lg bg-grey-01/80 px-4 py-3 text-[15px] leading-[22px] text-text/85">
            <span className="text-[13px] font-medium text-grey-04">Concedes</span>
            <span>{item.concede}</span>
          </div>
        )}

        {item.sources.length > 0 && <SourceChipList sources={item.sources} />}
      </div>
    </article>
  );
}
