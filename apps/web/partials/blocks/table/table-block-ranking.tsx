'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { loadLocalMyRankingDraft, saveLocalMyRankingDraft } from '~/core/blocks/ranking/local-ranking-my-draft';
import { rankingComposeHref } from '~/core/blocks/ranking/ranking-compose-url';
import {
  type RankingPeriodState,
  formatRankingPeriodLabel,
  getRankingPeriodState,
} from '~/core/blocks/ranking/ranking-period';
import { getRowDescription, getRowDisplayName } from '~/core/blocks/ranking/ranking-rankable-list';
import { useRankingBlockDates } from '~/core/blocks/ranking/use-ranking-block-dates';
import { useRankingBlockRelations } from '~/core/blocks/ranking/use-ranking-block-relations';
import { type RankingEntryDisplay, useRankingEntryEntities } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { useRankingSubmissions } from '~/core/blocks/ranking/use-ranking-submissions';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { useRankingComposeAccess } from '~/core/hooks/use-ranking-compose-access';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useCanUserEdit } from '~/core/hooks/use-user-is-editing';
import { useEditorInstance } from '~/core/state/editor/editor-provider';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';

import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';
import { Button, IconButton } from '~/design-system/button';
import { FilterTable } from '~/design-system/icons/filter-table';
import { FilterTableWithFilters } from '~/design-system/icons/filter-table-with-filters';
import { Fullscreen } from '~/design-system/icons/full-screen';
import { RankingChart } from '~/design-system/icons/ranking-chart';
import { Stars } from '~/design-system/icons/stars';
import { Time } from '~/design-system/icons/time';
import { tabGroupTabLinkStyles } from '~/design-system/tab-group';

import { RankingComposeEntitySheet } from './ranking-compose-entity-sheet';
import { RankingComposeSwipeableRow } from './ranking-compose-swipeable-row';
import { RankingEmptyStateArt } from './ranking-empty-state-art';
import { RankingEntryRow } from './ranking-entry-row';
import { RankingMyRankingDndList } from './ranking-my-ranking-dnd';
import { TableBlockContextMenu } from './table-block-context-menu';
import { TableBlockEditableFilters } from './table-block-editable-filters';

type Props = {
  spaceId: string;

  rankingStartDate?: string;

  rankingEndDate?: string;
};

type RankingTab = 'global' | 'my';

function RankingPeriodStatus({
  state,

  label,
}: {
  state: RankingPeriodState;

  label: string;
}) {
  const icon = state === 'not-started' ? <Stars color="grey-04" /> : <Time color="grey-04" />;

  return (
    <div className="mt-1 flex items-center gap-1.5 text-metadata text-grey-04">
      {icon}

      <span>{label}</span>
    </div>
  );
}

function RankingTabButton({
  active,

  label,

  onClick,

  layoutId,

  children,

  ariaLabel,
}: {
  active: boolean;

  label: string;

  onClick: () => void;

  layoutId: string;

  children?: React.ReactNode;

  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(tabGroupTabLinkStyles({ active }), 'gap-2 !text-smallTitle', active && 'font-medium')}
      aria-selected={active}
      aria-label={ariaLabel}
    >
      {children}

      {label}

      {active ? (
        <motion.div
          layoutId={layoutId}
          layout
          initial={false}
          transition={{ duration: 0.2 }}
          className="absolute right-0 bottom-[-8px] left-0 z-100 h-px bg-text"
        />
      ) : null}
    </button>
  );
}

function RankingSectionHeaderRow({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-x-3">
      {/* Not <h2>: .ProseMirror h2 applies mt-10 + text-mediumTitle and breaks alignment with the action. */}
      <span role="heading" aria-level={2} className="m-0 min-w-0 flex-1 truncate text-smallTitle font-medium text-text">
        {title}
      </span>
      {action ? <span className="inline-flex shrink-0 items-center">{action}</span> : null}
    </div>
  );
}

export function TableBlockRanking({ spaceId, rankingStartDate = '', rankingEndDate = '' }: Props) {
  const isMobile = useIsMobileLayout();
  const router = useRouter();
  const { ensureAccess } = useRankingComposeAccess(spaceId);

  const { name, entityId, relationId, rows } = useDataBlock();
  const { id: parentEntityId } = useEditorInstance();
  const { blockRelations } = useEditorStoreLite();

  const canEdit = useCanUserEdit(spaceId);

  const { filterState, setFilterState } = useFilters(canEdit);

  const { source, setSource } = useSource({ filterState, setFilterState });

  const { startDate, endDate } = useRankingBlockDates({
    startDate: rankingStartDate,

    endDate: rankingEndDate,
  });

  const displayName = name?.trim() || 'Untitled ranking';

  const { hasMySubmission, mySubmission, saveMySubmission, isSaving, personalSpaceId } = useRankingSubmissions(
    entityId,
    spaceId,
    displayName
  );

  const { globalRankingEntityIds, globalLeaderboard, aggregatedRankingEntityIds, aggregatedRankingCount } =
    useRankingBlockRelations();

  const { smartAccount } = useSmartAccount();
  const walletAddress = smartAccount?.account.address;
  const { profile } = useGeoProfile(walletAddress);
  const myAvatarUrl = profile?.avatarUrl && profile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? profile.avatarUrl : null;
  const myAvatarSeed = profile?.address ?? walletAddress ?? 'anonymous';
  const showMyRankingTab = Boolean(personalSpaceId);

  const [isFilterOpen, setIsFilterOpen] = React.useState(false);

  const [activeTab, setActiveTab] = React.useState<RankingTab>('global');
  const [activeSwipeRowKey, setActiveSwipeRowKey] = React.useState<string | null>(null);
  const [isMyRankingDragging, setIsMyRankingDragging] = React.useState(false);
  const [entitySheetTarget, setEntitySheetTarget] = React.useState<{
    entityId: string;
    spaceId: string;
    previewImageUrl?: string | null;
    previewName?: string | null;
    previewDescription?: string | null;
  } | null>(null);

  const rowsByEntityId = React.useMemo(() => new Map(rows.map(r => [r.entityId, r])), [rows]);

  const periodState = React.useMemo(() => getRankingPeriodState(startDate, endDate), [startDate, endDate]);

  const periodLabel = React.useMemo(
    () => formatRankingPeriodLabel(periodState, startDate, endDate),

    [periodState, startDate, endDate]
  );

  const showAggregatedRankingsOnGlobalTab = aggregatedRankingCount > 0;
  const visibleAggregatedRankingIds = aggregatedRankingEntityIds.slice(0, 3);
  const extraAggregatedRankingCount = Math.max(aggregatedRankingCount - visibleAggregatedRankingIds.length, 0);

  const globalDisplayEntityIds = globalRankingEntityIds;

  const globalRankByEntityId = React.useMemo(
    () => new Map(globalLeaderboard.map(e => [e.entityId, e.rank])),
    [globalLeaderboard]
  );

  const mySubmissionIdsKey = (mySubmission?.orderedEntityIds ?? []).join('|');

  const [myOrderIds, setMyOrderIds] = React.useState<string[]>([]);
  const [hasSavedDraft, setHasSavedDraft] = React.useState(false);

  React.useEffect(() => {
    const draft = loadLocalMyRankingDraft(spaceId, entityId);
    if (draft !== null) {
      setHasSavedDraft(true);
      setMyOrderIds(draft);
      return;
    }
    setHasSavedDraft(false);
    setMyOrderIds(mySubmission?.orderedEntityIds ?? []);
  }, [entityId, mySubmissionIdsKey, mySubmission, spaceId]);

  const draftHydrated = true;

  const persistMyOrder = React.useCallback(
    (nextIds: string[]) => {
      if (nextIds.length === 0) {
        setMyOrderIds([]);
        saveLocalMyRankingDraft(spaceId, entityId, []);
        setHasSavedDraft(false);
        return;
      }
      setMyOrderIds(nextIds);
      saveLocalMyRankingDraft(spaceId, entityId, nextIds);
      setHasSavedDraft(true);
    },
    [entityId, spaceId]
  );

  const myDisplayEntityIds = React.useMemo(() => {
    if (myOrderIds.length > 0) return myOrderIds;
    if (hasSavedDraft) return myOrderIds;
    return mySubmission?.orderedEntityIds ?? [];
  }, [hasSavedDraft, myOrderIds, mySubmission]);

  const showMyRankingSection = showMyRankingTab;

  const { entries: globalEntries, isLoading: isLoadingGlobalEntries } = useRankingEntryEntities(
    spaceId,
    globalDisplayEntityIds
  );

  const { entries: myEntries } = useRankingEntryEntities(spaceId, myDisplayEntityIds);

  const globalEntriesById = React.useMemo(() => new Map(globalEntries.map(e => [e.entityId, e])), [globalEntries]);

  const myEntriesById = React.useMemo(() => new Map(myEntries.map(e => [e.entityId, e])), [myEntries]);

  const myRankingEntryByEntityId = React.useMemo(() => {
    const map = new Map<string, RankingEntryDisplay>();

    for (const row of rows) {
      if (!row.entityId || row.placeholder) continue;
      map.set(row.entityId, {
        entityId: row.entityId,
        name: getRowDisplayName(row),
        description: getRowDescription(row),
        image: row.columns[SystemIds.NAME_PROPERTY]?.image ?? null,
      });
    }

    for (const entry of myEntries) {
      map.set(entry.entityId, entry);
    }

    return map;
  }, [myEntries, rows]);

  const resolveEntitySpaceId = (entityId: string) => {
    const row = rowsByEntityId.get(entityId);
    return row?.columns[SystemIds.NAME_PROPERTY]?.space ?? spaceId;
  };

  const openEntitySheet = (entityId: string) => {
    const entry = myRankingEntryByEntityId.get(entityId);
    const row = rowsByEntityId.get(entityId);
    setEntitySheetTarget({
      entityId,
      spaceId: resolveEntitySpaceId(entityId),
      previewImageUrl: entry?.image ?? null,
      previewName: entry?.name ?? (row ? getRowDisplayName(row) : null),
      previewDescription: entry?.description ?? (row ? getRowDescription(row) : null),
    });
  };

  const buildSubmissionSlots = React.useCallback(
    (orderedIds: string[]) =>
      orderedIds.map(id => {
        const entry = myEntriesById.get(id);
        const row = rowsByEntityId.get(id);
        return {
          id,
          name: entry?.name ?? (row ? getRowDisplayName(row) : null),
          spaceId: resolveEntitySpaceId(id),
        };
      }),
    [myEntriesById, rowsByEntityId]
  );

  const removeFromMyRanking = React.useCallback(
    (entityId: string) => {
      setActiveSwipeRowKey(null);
      const remaining = myDisplayEntityIds.filter(id => id !== entityId);
      persistMyOrder(remaining);

      if (hasMySubmission) {
        void saveMySubmission(buildSubmissionSlots(remaining));
      }
    },
    [buildSubmissionSlots, hasMySubmission, myDisplayEntityIds, persistMyOrder, saveMySubmission]
  );

  const reorderMyRanking = React.useCallback(
    (nextIds: string[]) => {
      const current = myDisplayEntityIds;
      if (nextIds.length === 0 && current.length > 0) return;
      if (nextIds.length !== current.length) return;

      const currentIdSet = new Set(current);
      if (!nextIds.every(id => currentIdSet.has(id))) return;

      setActiveSwipeRowKey(null);
      persistMyOrder(nextIds);

      if (hasMySubmission) {
        void saveMySubmission(buildSubmissionSlots(nextIds));
      }
    },
    [buildSubmissionSlots, hasMySubmission, myDisplayEntityIds, persistMyOrder, saveMySubmission]
  );

  const wrapMobileSwipeRow = ({
    rowKey,
    showRemove = false,
    onView,
    onRemove,
    onPrimaryClick,
    primaryDisabled = false,
    children,
  }: {
    rowKey: string;
    showRemove?: boolean;
    onView: () => void;
    onRemove?: () => void;
    onPrimaryClick?: () => void;
    primaryDisabled?: boolean;
    children: React.ReactNode;
  }) => {
    if (!isMobile) return children;

    return (
      <RankingComposeSwipeableRow
        rowKey={rowKey}
        activeRowKey={activeSwipeRowKey}
        onActiveRowKeyChange={setActiveSwipeRowKey}
        showRemove={showRemove}
        onView={onView}
        onRemove={onRemove}
        onPrimaryClick={onPrimaryClick}
        primaryDisabled={primaryDisabled}
        swipeEnabled={!isMyRankingDragging}
      >
        {children}
      </RankingComposeSwipeableRow>
    );
  };

  const resolveBlockRelationId = React.useCallback(() => {
    if (relationId) return relationId;
    const blockRelation = blockRelations.find(r => r.block.id === entityId);
    return blockRelation?.relationId ?? blockRelation?.id ?? blockRelation?.entityId ?? '';
  }, [blockRelations, entityId, relationId]);

  const openRankingCompose = async () => {
    const allowed = await ensureAccess();
    if (!allowed) return;

    const effectiveRelationId = resolveBlockRelationId();
    if (!effectiveRelationId) return;

    router.push(
      rankingComposeHref({
        spaceId,
        blockEntityId: entityId,
        relationId: effectiveRelationId,
        parentEntityId,
        rankingStartDate,
        rankingEndDate,
      })
    );
  };

  const showEditRankingButton = hasMySubmission || myDisplayEntityIds.length > 0;

  const myRankingActionButton = showEditRankingButton ? (
    <Button
      variant="secondary"
      small
      className="shrink-0 !rounded-full !border-text !bg-white !px-3 whitespace-nowrap !text-text"
      disabled={isSaving}
      onClick={() => void openRankingCompose()}
    >
      Edit
    </Button>
  ) : (
    <Button
      variant="primary"
      small
      className="shrink-0 !rounded-full !px-3 whitespace-nowrap"
      icon={<RankingChart color="white" />}
      disabled={isSaving}
      onClick={() => void openRankingCompose()}
    >
      Add my ranking
    </Button>
  );

  const globalRankingBody = (
    <div className="flex flex-col gap-4">
      {globalDisplayEntityIds.length === 0 ? (
        <div className="flex min-h-[140px] items-center justify-between gap-6 rounded-lg bg-grey-01 px-6 py-5">
          <p className="max-w-md text-metadata text-grey-04">
            Your entries will become the starting global ranking for everyone else. Switch to &ldquo;My ranking&rdquo;
            and use &ldquo;Add my ranking&rdquo; to get started.
          </p>
          <RankingEmptyStateArt />
        </div>
      ) : isLoadingGlobalEntries ? (
        <p className="text-metadata text-grey-03">Loading ranking…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {globalDisplayEntityIds.map(entityId => {
            const entry = globalEntriesById.get(entityId);
            const rank = globalRankByEntityId.get(entityId);
            if (!entry || rank == null) return null;
            return <RankingEntryRow key={entityId} rank={rank} rankStyle="leading" entry={entry} spaceId={spaceId} />;
          })}
        </div>
      )}
    </div>
  );

  const myRankingBody = (
    <div className="flex flex-col gap-4">
      {!draftHydrated ? (
        <p className="text-metadata text-grey-03">Loading your ranking…</p>
      ) : myDisplayEntityIds.length === 0 ? (
        <div className="flex min-h-[120px] items-center rounded-lg bg-grey-01 px-6 py-5">
          <p className="text-metadata text-grey-04">
            Your ranking is empty. Use &ldquo;Add my ranking&rdquo; to pick entries from the filtered list.
          </p>
        </div>
      ) : (
        <RankingMyRankingDndList
          entityIds={myDisplayEntityIds}
          onReorder={reorderMyRanking}
          onDragStart={() => {
            setActiveSwipeRowKey(null);
            setIsMyRankingDragging(true);
          }}
          onDragEnd={() => setIsMyRankingDragging(false)}
          className="flex flex-col gap-3"
          renderItem={(entityId, index) => {
            const entryDisplay = myRankingEntryByEntityId.get(entityId) ?? {
              entityId,
              name: 'Untitled',
              description: null,
              image: null,
            };
            const rowContent = (
              <RankingEntryRow
                rank={index + 1}
                rankStyle="leading"
                linkToEntity={false}
                entry={entryDisplay}
                spaceId={spaceId}
              />
            );
            return wrapMobileSwipeRow({
              rowKey: `my:${entityId}`,
              showRemove: true,
              onView: () => openEntitySheet(entityId),
              onRemove: () => removeFromMyRanking(entityId),
              primaryDisabled: true,
              children: rowContent,
            });
          }}
        />
      )}
    </div>
  );

  return (
    <div className="w-full min-w-0 overflow-x-hidden" onMouseDown={e => e.stopPropagation()}>
      <RankingComposeEntitySheet target={entitySheetTarget} onClose={() => setEntitySheetTarget(null)} />

      <div className="mb-2 flex items-start justify-between gap-4" onMouseDown={e => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <h4 className="text-mediumTitle text-text">{displayName}</h4>

          {periodLabel ? <RankingPeriodStatus state={periodState} label={periodLabel} /> : null}
        </div>

        <div className="flex shrink-0 items-center gap-5">
          <IconButton
            onClick={() => setIsFilterOpen(open => !open)}
            icon={filterState.length > 0 ? <FilterTableWithFilters /> : <FilterTable />}
            color="grey-04"
          />

          <IconButton
            onClick={() => void openRankingCompose()}
            icon={<Fullscreen color="grey-04" />}
            color="grey-04"
            aria-label="Open fullscreen"
          />

          <TableBlockContextMenu sourceType={source.type} />
        </div>
      </div>

      {isFilterOpen && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cx('mb-4 overflow-hidden', canEdit ? 'border-t border-divider py-4' : 'py-2')}
            onMouseDown={e => e.stopPropagation()}
          >
            <TableBlockEditableFilters
              filterState={filterState}
              setFilterState={setFilterState}
              filterSuggestionSpaceId={spaceId}
              isEditing={canEdit}
            />
          </motion.div>
        </AnimatePresence>
      )}

      {/* Mobile (≤1023px): `lg:` = max-width in styles.css */}
      <div className="hidden w-full min-w-0 flex-col lg:flex">
        {showMyRankingSection ? (
          <section className="flex w-full min-w-0 flex-col gap-3">
            <RankingSectionHeaderRow title="My ranking" action={showMyRankingTab ? myRankingActionButton : null} />
            {myRankingBody}
          </section>
        ) : null}

        {showMyRankingSection ? <div className="my-6 h-px shrink-0 bg-grey-02" role="separator" aria-hidden /> : null}

        <section className="flex w-full min-w-0 flex-col gap-3">
          <RankingSectionHeaderRow title="Global ranking" />
          {globalRankingBody}
        </section>
      </div>

      {/* Desktop */}
      <div className="lg:hidden">
        {showMyRankingSection ? (
          <>
            <div className="relative mb-4">
              <div className="flex w-full min-w-0 flex-nowrap items-end justify-between gap-3">
                <div className="relative flex min-w-0 flex-1 items-center gap-6 overflow-hidden pb-2">
                  <RankingTabButton
                    active={activeTab === 'global'}
                    label={showAggregatedRankingsOnGlobalTab ? '' : 'Global ranking'}
                    ariaLabel={showAggregatedRankingsOnGlobalTab ? 'Global ranking' : undefined}
                    layoutId="ranking-block-tab-underline"
                    onClick={() => setActiveTab('global')}
                  >
                    {showAggregatedRankingsOnGlobalTab ? (
                      <div className="flex items-center gap-2">
                        <AvatarGroup>
                          {visibleAggregatedRankingIds.map(rankingEntityId => (
                            <AvatarGroup.Item key={rankingEntityId}>
                              <Avatar size={24} value={rankingEntityId} />
                            </AvatarGroup.Item>
                          ))}
                        </AvatarGroup>
                        {extraAggregatedRankingCount > 0 ? (
                          <span className="text-metadata text-grey-04">+{extraAggregatedRankingCount}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </RankingTabButton>

                  {showMyRankingTab ? (
                    <RankingTabButton
                      active={activeTab === 'my'}
                      label="My ranking"
                      layoutId="ranking-block-tab-underline"
                      onClick={() => setActiveTab('my')}
                    >
                      <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full">
                        <Avatar avatarUrl={myAvatarUrl} value={myAvatarSeed} size={24} />
                      </span>
                    </RankingTabButton>
                  ) : null}
                </div>

                {showMyRankingTab ? (
                  <div className="mb-2 flex shrink-0 items-center">{myRankingActionButton}</div>
                ) : null}
              </div>

              <div className="absolute right-0 bottom-0 left-0 z-0 h-px bg-grey-02" />
            </div>

            {activeTab === 'global' ? globalRankingBody : myRankingBody}
          </>
        ) : (
          <section className="mb-4 flex w-full min-w-0 flex-col gap-3">
            <RankingSectionHeaderRow title="Global ranking" />
            {globalRankingBody}
          </section>
        )}
      </div>
    </div>
  );
}
