'use client';

import * as React from 'react';

import Link from 'next/link';

import {
  type ClaimKind,
  type ClaimTemplateModel,
  type StrongestCaseModel,
  type SubClaimModel,
  formatClaimKindLabel,
} from '../models';
import {
  AddClaimPopover,
  CheckCircleIcon,
  EntityContextTogglePill,
  EntityFlagsSection,
  EntityInlineContext,
  EntityOverflowMenu,
  GraphConnectionsStrip,
  RelatedListSection,
  SourceChipList,
  SplitBars,
  TEMPLATE_CARD_SURFACE,
  TemplateBadge,
  type TemplateBadgeTone,
  TemplateShell,
  VoteBox,
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
  className?: string;
}

/**
 * Pure, data-driven Claim page template.
 *
 * Mirrors Geo's GRC-20 Claim ontology: every assertion is a `Claim` with a stored epistemic
 * property (`Factual` / `Judgment` / `Value judgment`), while agreement state (`Where they split`
 * vs `Common ground`) is computed dynamically from community vote splits and shown in the bars.
 */
export function ClaimTemplate({ model, headerActions, footer, className }: ClaimTemplateProps) {
  return (
    <TemplateShell
      maxWidth={860}
      breadcrumbs={model.breadcrumbs}
      coverUrl={model.coverUrl}
      coverAlt={model.title}
      contextByEntityId={model.contextByEntityId}
      className={className}
    >
      {/* Header (name first, type labels below) */}
      <header className="flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-4">
          <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>
          <div className="flex shrink-0 items-center gap-2 pt-1.5">
            <EntityContextTogglePill />
            {headerActions}
            <EntityOverflowMenu target={{ id: model.id, kind: 'Claim', title: model.title }} isPageRoot size="md" />
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

      {/* Context relations & Flags (always rendered even when empty) */}
      <GraphConnectionsStrip
        groups={model.graphConnections ?? []}
        target={{ id: model.id, kind: 'Claim', title: model.title }}
      />

      <EntityFlagsSection target={{ id: model.id, kind: 'Claim', title: model.title }} />

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

      {/* Supporting, Opposing, and Related claims */}
      {model.subClaims && model.subClaims.length > 0 && <GroupedSubClaimSections subClaims={model.subClaims} />}

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

      {/* Related entity lists (Parent claim, Events, In the news, Sources, Debates, Topics) */}
      {model.sections.length > 0 && (
        <div className="flex flex-col gap-8">
          {model.sections.map(section => (
            <RelatedListSection key={section.id} section={section} />
          ))}
        </div>
      )}

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

function GroupedSubClaimSections({ subClaims }: { subClaims: readonly SubClaimModel[] }) {
  const [added, setAdded] = React.useState<SubClaimModel[]>([]);
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
        <section key={section.id} aria-label={section.title} className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-mediumTitle font-semibold text-text">{section.title}</h2>
            <AddClaimPopover
              label={section.addLabel}
              onSubmit={draft =>
                setAdded(prev => [
                  ...prev,
                  {
                    id: `claim-sub-${Date.now()}`,
                    title: draft.title,
                    kind: draft.kind,
                    stance: section.stance,
                    stat: draft.note,
                    split: { rows: [], isSplit: false },
                    sources: [],
                  },
                ])
              }
            />
          </div>
          <div className={`divide-y divide-divider overflow-hidden ${TEMPLATE_CARD_SURFACE}`}>
            {section.items.map(subClaim => (
              <SubClaimRow key={subClaim.id} subClaim={subClaim} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function SubClaimRow({ subClaim }: { subClaim: SubClaimModel }) {
  return (
    <article className="grid grid-cols-1 items-start gap-4 p-5 @[680px]:grid-cols-[minmax(0,1fr)_304px] @[680px]:gap-6 @[680px]:p-6">
      <div className="flex min-w-0 flex-col gap-2">
        {subClaim.href ? (
          <Link
            href={subClaim.href}
            className="text-[17px] leading-[23px] font-semibold text-text no-underline hover:text-[#4c1fd4]"
          >
            {subClaim.title}
          </Link>
        ) : subClaim.onSelect ? (
          <button
            type="button"
            onClick={subClaim.onSelect}
            className="cursor-pointer border-0 bg-transparent p-0 text-left text-[17px] leading-[23px] font-semibold text-text hover:text-[#4c1fd4]"
          >
            {subClaim.title}
          </button>
        ) : (
          <h3 className="m-0 text-[17px] leading-[23px] font-semibold text-text">{subClaim.title}</h3>
        )}

        {subClaim.kind && (
          <div>
            <TemplateBadge tone={CLAIM_KIND_TONE[subClaim.kind]} className="!h-6 !px-2 !text-[12.5px]">
              {formatClaimKindLabel(subClaim.kind)}
            </TemplateBadge>
          </div>
        )}

        {subClaim.stat && <p className="m-0 text-[15px] leading-[22px] text-grey-04">{subClaim.stat}</p>}

        {subClaim.sources.length > 0 && <SourceChipList sources={subClaim.sources} className="pt-0.5" />}

        <EntityInlineContext targetId={subClaim.id} targetTitle={subClaim.title} targetKind="Claim" />
      </div>

      <div className="flex items-start justify-between gap-2 @[680px]:pt-1">
        <SplitBars rows={subClaim.split.rows} density="compact" className="min-w-0 flex-1" />
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
