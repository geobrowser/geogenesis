'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchEntityDiff } from '~/core/io/subgraph/fetch-entity-diff';

import { SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Close } from '~/design-system/icons/close';
import { SlideUp } from '~/design-system/slide-up';
import { Text } from '~/design-system/text';

import { ChangedEntity } from '~/partials/review/review-changes';

export interface HistoryDiffSelection {
  entityId: string;
  spaceId: string;
  /** When omitted, shows the entity's creation as an all-added diff. */
  fromEditId?: string;
  toEditId: string;
  label: string;
}

interface Props {
  selection: HistoryDiffSelection | null;
  onClose: () => void;
}

export function HistoryDiffSlideUp({ selection, onClose }: Props) {
  const isOpen = selection !== null;
  const setIsOpen = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <SlideUp isOpen={isOpen} setIsOpen={setIsOpen}>
      {selection && <HistoryDiffContent selection={selection} onClose={onClose} />}
    </SlideUp>
  );
}

function HistoryDiffContent({ selection, onClose }: { selection: HistoryDiffSelection; onClose: () => void }) {
  const { data: diff, isLoading } = useQuery({
    queryKey: ['entity-diff', selection.entityId, selection.fromEditId, selection.toEditId, selection.spaceId],
    queryFn: ({ signal }) =>
      fetchEntityDiff({
        entityId: selection.entityId,
        fromEditId: selection.fromEditId,
        toEditId: selection.toEditId,
        spaceId: selection.spaceId,
        signal,
      }),
  });

  const isEmpty =
    !isLoading && (!diff || (diff.values.length === 0 && diff.relations.length === 0 && diff.blocks.length === 0));

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <div className="sticky top-0 z-50 flex w-full items-center justify-between gap-1 border-b border-divider bg-white px-4 py-1 text-button text-text md:px-4 md:py-3">
        <div className="inline-flex items-center gap-4">
          <SquareButton icon={<Close />} onClick={onClose} />
          <p>{selection.label}</p>
        </div>
      </div>
      <div className="relative overflow-x-clip overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-[1200px] pt-10 pb-20 xl:pt-[40px] xl:pr-[2ch] xl:pb-[4ch] xl:pl-[2ch]">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <Dots />
            </div>
          )}
          {isEmpty && (
            <div className="flex flex-col items-center justify-center py-16">
              <Text variant="bodySemibold" color="grey-04">
                No changes in this version
              </Text>
            </div>
          )}
          {diff && !isEmpty && (
            <div className="flex flex-col gap-2">
              <div className="rounded-xl bg-white p-4">
                <div className="relative mx-auto w-full max-w-[1350px] shrink-0">
                  <ChangedEntity entity={diff} spaceId={selection.spaceId} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
