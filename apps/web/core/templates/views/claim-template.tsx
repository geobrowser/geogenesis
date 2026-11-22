'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

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
  SplitBars,
  TEMPLATE_CARD_SURFACE,
  TemplateBadge,
  type TemplateBadgeTone,
  TemplateShell,
  ThumbDownIcon,
  ThumbUpIcon,
  TopicImagePills,
  VoteBox,
  useListRanking,
} from '../primitives';

const CLAIM_KIND_TONE: Record<ClaimKind, TemplateBadgeTone> = {
  fact: 'fact',
  judgment: 'judgment',
  'value-judgment': 'value',
};

export interface ClaimTemplateProps {
  model: ClaimTemplateModel;
  /** Optional header actions slot (e.g. share, overflow menu, history on live Geo pages). */
  headerActions?: React.ReactNode;
  /** Optional footer slot (e.g. edit-mode property sheet & backlinks). */
  footer?: React.ReactNode;
  /** Live GRC-20 persistence & search callbacks. */
  actionCallbacks?: EntityActionCallbacks;
  /** Compact density when rendered inside the narrow entity side panel. */
  compact?: boolean;
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
  footer,
  actionCallbacks,
  compact = false,
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
        <div className="flex items-start justify-between gap-4">
          <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>
          <div className="flex shrink-0 items-center gap-2 pt-1.5">
            <EntityContextTogglePill />
            {headerActions ?? (
              <EntityOverflowMenu target={{ id: model.id, kind: 'Claim', title: model.title }} isPageRoot size="md" />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TemplateBadge tone="neutral">Claim</TemplateBadge>
          <TemplateBadge tone={CLAIM_KIND_TONE[model.kind]}>{formatClaimKindLabel(model.kind)}</TemplateBadge>
          {model.debateCount !== undefined && model.debateCount > 0 && (
            <DebateCountLink count={model.debateCount} href={model.debatesHref} onSelect={model.onOpenDebates} />
          )}
        </div>

        <EntityInlineContext targetId={model.id} targetTitle={model.title} targetKind="Claim" />
      </header>

      {/* Vote box + community split bars */}
      <VoteBox split={model.split} control={model.voteBox} />

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
        <GroupedSubClaimSections subClaims={model.subClaims} onAddClaim={actionCallbacks?.onAddClaim} />
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

      {footer}
    </TemplateShell>
  );
}

function DebateCountLink({ count, href, onSelect }: { count: number; href?: string; onSelect?: () => void }) {
  const text = `${count} ${count === 1 ? 'debate' : 'debates'}`;
  const linkClasses =
    'ml-1 text-[14px] font-medium text-grey-04 underline decoration-grey-02 underline-offset-2 transition-colors hover:text-[#4c1fd4] hover:decoration-[#4c1fd4]';

  if (href) {
    return (
      <Link href={href} className={linkClasses}>
        {text}
      </Link>
    );
  }

  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={`cursor-pointer border-0 bg-transparent p-0 ${linkClasses}`}>
        {text}
      </button>
    );
  }

  return <span className="ml-1 text-[14px] text-grey-04">{text}</span>;
}

const SUBCLAIMS_PER_PAGE = 6;

function GroupedSubClaimSections({
  subClaims,
  onAddClaim,
}: {
  subClaims: readonly SubClaimModel[];
  onAddClaim?: EntityActionCallbacks['onAddClaim'];
}) {
  const [added, setAdded] = React.useState<SubClaimModel[]>([]);
  const [pagesBySection, setPagesBySection] = React.useState<Record<string, number>>({});
  const combined = [...subClaims, ...added];

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
          onAddClaim={draft => {
            onAddClaim?.({ ...draft, stance: section.stance });
            setAdded(prev => [
              {
                id: `claim-sub-${Date.now()}`,
                title: draft.title,
                kind: draft.kind,
                stance: section.stance,
                stat: draft.note,
                split: { rows: [], isSplit: false },
                sources: [],
              },
              ...prev,
            ]);
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
          <AddClaimPopover label={section.addLabel} onSubmit={onAddClaim} />
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
        {visibleItems.map((subClaim, idx) => (
          <SubClaimRow key={subClaim.id} rank={startIndex + idx + 1} subClaim={subClaim} />
        ))}
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

function SubClaimRow({ rank, subClaim }: { rank: number; subClaim: SubClaimModel }) {
  const totalVotes = subClaim.split.totalVotes;
  const voteCountLabel =
    totalVotes !== undefined && totalVotes > 0
      ? `${formatCompactCount(totalVotes)} ${totalVotes === 1 ? 'vote' : 'votes'}`
      : '0 votes';

  const handleVoteClick = (choice: 'agree' | 'disagree') => {
    if (!subClaim.onVote) return;
    if (subClaim.userVote === choice && subClaim.onClearVote) {
      subClaim.onClearVote();
      return;
    }
    subClaim.onVote(choice);
  };

  return (
    <article className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-grey-01/40 @[760px]:flex-row @[760px]:items-center @[760px]:justify-between @[760px]:gap-6">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className="w-6 shrink-0 pt-0.5 text-center text-[15px] font-medium text-grey-04 tabular-nums">
          {rank}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {subClaim.href ? (
            <Link
              href={subClaim.href}
              className="text-[16px] leading-[22px] font-semibold text-pretty text-text no-underline transition-colors hover:text-[#4c1fd4]"
            >
              {subClaim.title}
            </Link>
          ) : subClaim.onSelect ? (
            <button
              type="button"
              onClick={subClaim.onSelect}
              className="cursor-pointer border-0 bg-transparent p-0 text-left text-[16px] leading-[22px] font-semibold text-pretty text-text transition-colors hover:text-[#4c1fd4]"
            >
              {subClaim.title}
            </button>
          ) : (
            <h3 className="m-0 text-[16px] leading-[22px] font-semibold text-pretty text-text">{subClaim.title}</h3>
          )}

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            {subClaim.kind && (
              <TemplateBadge tone={CLAIM_KIND_TONE[subClaim.kind]} className="!h-6 !px-2 !text-[12.5px]">
                {formatClaimKindLabel(subClaim.kind)}
              </TemplateBadge>
            )}

            {subClaim.onVote && (
              <div className="inline-flex items-center gap-1.5" role="group" aria-label={`Vote on ${subClaim.title}`}>
                <button
                  type="button"
                  aria-pressed={subClaim.userVote === 'agree'}
                  onClick={() => handleVoteClick('agree')}
                  className={cx(
                    'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                    subClaim.userVote === 'agree'
                      ? 'border-text bg-text text-white'
                      : 'border-grey-02 bg-white text-text hover:border-text'
                  )}
                >
                  <ThumbUpIcon className="size-3.5 shrink-0" />
                  <span>Agree</span>
                  {subClaim.agreeCount !== undefined && subClaim.agreeCount > 0 && (
                    <span
                      className={cx(
                        'text-[12px] tabular-nums',
                        subClaim.userVote === 'agree' ? 'text-white/80' : 'text-grey-04'
                      )}
                    >
                      {formatCompactCount(subClaim.agreeCount)}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  aria-pressed={subClaim.userVote === 'disagree'}
                  onClick={() => handleVoteClick('disagree')}
                  className={cx(
                    'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                    subClaim.userVote === 'disagree'
                      ? 'border-text bg-text text-white'
                      : 'border-grey-02 bg-white text-text hover:border-text'
                  )}
                >
                  <ThumbDownIcon className="size-3.5 shrink-0" />
                  <span>Disagree</span>
                  {subClaim.disagreeCount !== undefined && subClaim.disagreeCount > 0 && (
                    <span
                      className={cx(
                        'text-[12px] tabular-nums',
                        subClaim.userVote === 'disagree' ? 'text-white/80' : 'text-grey-04'
                      )}
                    >
                      {formatCompactCount(subClaim.disagreeCount)}
                    </span>
                  )}
                </button>
              </div>
            )}

            {subClaim.debateCount !== undefined && subClaim.debateCount > 0 && (
              <DebateCountLink count={subClaim.debateCount} href={subClaim.debatesHref} />
            )}
          </div>

          {subClaim.stat && <p className="m-0 text-[14.5px] leading-[21px] text-grey-04">{subClaim.stat}</p>}

          {subClaim.sources.length > 0 && <SourceChipList sources={subClaim.sources} className="pt-0.5" />}

          <EntityInlineContext targetId={subClaim.id} targetTitle={subClaim.title} targetKind="Claim" />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 pl-10 @[760px]:pl-0">
        {subClaim.split.rows.length > 0 ? (
          <SplitBars rows={subClaim.split.rows} density="compact" className="w-[240px] shrink-0" />
        ) : (
          <div className="hidden w-[240px] shrink-0 items-center gap-2 @[760px]:flex">
            <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-grey-01" />
            <span className="w-[38px] text-right text-[12.5px] text-grey-03 tabular-nums">—</span>
          </div>
        )}

        <span className="w-[68px] shrink-0 text-right text-[13px] whitespace-nowrap text-grey-04 tabular-nums">
          {voteCountLabel}
        </span>

        <EntityOverflowMenu target={{ id: subClaim.id, kind: 'Claim', title: subClaim.title }} />
      </div>
    </article>
  );
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
