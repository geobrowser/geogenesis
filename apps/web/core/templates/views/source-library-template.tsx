'use client';

import * as React from 'react';

import cx from 'classnames';

import type { SourceLibraryGroup, SourceLibraryTemplateModel } from '../models';
import { RelatedListSection, SearchIcon, TemplateBadge, TemplateShell } from '../primitives';

export interface SourceLibraryTemplateProps {
  model: SourceLibraryTemplateModel;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const GROUP_FILTERS: readonly { id: 'all' | SourceLibraryGroup; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'primary', label: 'Primary documents' },
  { id: 'reporting', label: 'Reporting' },
  { id: 'data', label: 'Data' },
  { id: 'statement', label: 'Statements' },
];

const INITIAL_PAGE_SIZE = 8;

/**
 * Searchable & filterable Source Library view built atop rich format-aware Source media cards.
 */
export function SourceLibraryTemplate({ model, headerActions, footer, className }: SourceLibraryTemplateProps) {
  const [query, setQuery] = React.useState('');
  const [activeGroup, setActiveGroup] = React.useState<'all' | SourceLibraryGroup>('all');
  const [showAll, setShowAll] = React.useState(false);

  const [adding, setAdding] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState('');
  const [draftUrl, setDraftUrl] = React.useState('');

  const normalizedQuery = query.trim().toLowerCase();

  const sortedSources = React.useMemo(
    () =>
      [...model.sources].sort(
        (a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0) || a.title.localeCompare(b.title)
      ),
    [model.sources]
  );

  const filtered = React.useMemo(() => {
    return sortedSources.filter(source => {
      if (activeGroup !== 'all' && source.group !== activeGroup) return false;
      if (!normalizedQuery) return true;
      const haystack = [source.title, source.publisher, source.kindLabel, source.excerpt, source.authorHandle]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [activeGroup, normalizedQuery, sortedSources]);

  const isFiltered = activeGroup !== 'all' || normalizedQuery.length > 0;
  const visible = isFiltered || showAll ? filtered : filtered.slice(0, INITIAL_PAGE_SIZE);
  const hasMore = !isFiltered && !showAll && filtered.length > INITIAL_PAGE_SIZE;

  const handleAddSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draftTitle.trim()) return;
    model.onAddSource?.({ title: draftTitle.trim(), url: draftUrl.trim() });
    setDraftTitle('');
    setDraftUrl('');
    setAdding(false);
  };

  return (
    <TemplateShell maxWidth={1040} breadcrumbs={model.breadcrumbs} className={className}>
      {/* Header */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <TemplateBadge tone="source">Source library</TemplateBadge>
            <TemplateBadge tone="neutral">
              {model.totalCountLabel ?? `${model.sources.length} sources linked`}
            </TemplateBadge>
          </div>
          {headerActions}
        </div>
        <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>
        {model.lede && <p className="m-0 max-w-[760px] text-[16.5px] leading-[25px] text-text/85">{model.lede}</p>}
      </header>

      {/* Search + group filters */}
      <section aria-label="Search and filter sources" className="flex flex-col gap-3.5">
        <div className="relative flex items-center">
          <SearchIcon className="pointer-events-none absolute left-3.5 size-4 text-grey-04" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search sources"
            placeholder="Search by title, publisher, or topic..."
            className="h-11 w-full rounded-xl border border-grey-02 bg-white pr-4 pl-10 text-[16px] text-text placeholder:text-grey-04 focus:border-text focus:outline-hidden"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {GROUP_FILTERS.map(filter => {
              const count =
                filter.id === 'all'
                  ? sortedSources.length
                  : sortedSources.filter(item => item.group === filter.id).length;
              const isSelected = activeGroup === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setActiveGroup(filter.id)}
                  className={cx(
                    'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition-colors',
                    isSelected
                      ? 'border-text bg-text text-white'
                      : 'border-grey-02 bg-white text-text hover:border-text'
                  )}
                >
                  <span>{filter.label}</span>
                  <span className={cx('tabular-nums', isSelected ? 'text-grey-03' : 'text-grey-04')}>{count}</span>
                </button>
              );
            })}
          </div>

          {model.onAddSource && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-9 cursor-pointer items-center rounded-full border border-grey-02 bg-white px-4 text-[14px] font-medium text-text transition-colors hover:border-text"
            >
              + Add a source
            </button>
          )}
        </div>

        {adding && model.onAddSource && (
          <form
            onSubmit={handleAddSubmit}
            className="flex flex-col gap-3 rounded-xl border border-text bg-white p-4 @[600px]:flex-row @[600px]:items-center"
          >
            <input
              type="text"
              value={draftTitle}
              onChange={e => setDraftTitle(e.target.value)}
              placeholder="Source title"
              className="flex-1 rounded-lg border border-grey-02 px-3 py-2 text-[15px] text-text focus:border-text focus:outline-hidden"
            />
            <input
              type="url"
              value={draftUrl}
              onChange={e => setDraftUrl(e.target.value)}
              placeholder="https://... (optional)"
              className="flex-1 rounded-lg border border-grey-02 px-3 py-2 text-[15px] text-text focus:border-text focus:outline-hidden"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="inline-flex h-9 cursor-pointer items-center rounded-full border border-text bg-text px-4 text-[14px] font-medium text-white hover:opacity-90"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="cursor-pointer border-0 bg-transparent px-2 text-[14px] text-grey-04 hover:text-text"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Results */}
      <RelatedListSection
        section={{
          id: 'source-library-results',
          title: isFiltered
            ? `${filtered.length} ${filtered.length === 1 ? 'source matches' : 'sources match'}`
            : `Most cited (${visible.length} of ${sortedSources.length})`,
          layout: 'cards',
          items: visible.map(item => ({
            ...item,
            date:
              item.citationCount && item.citationCount > 0
                ? [item.date, `Cited ${item.citationCount}×`].filter(Boolean).join(' · ')
                : item.date,
          })),
          emptyText: 'No sources match. Try another word or filter.',
        }}
      />

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="inline-flex h-10 cursor-pointer items-center rounded-full border border-grey-02 bg-white px-5 text-[15px] font-medium text-text transition-colors hover:border-text"
          >
            Load all {filtered.length} sources
          </button>
        </div>
      )}

      {footer}
    </TemplateShell>
  );
}
