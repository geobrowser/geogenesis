'use client';

import { Button } from '~/design-system/button';

import { RankingComposePublishSpacePicker } from './ranking-compose-publish-space-picker';

type Props = {
  publishSpaceIds: string[];
  publishSpaceId: string;
  onPublishSpaceIdChange: (spaceId: string) => void;
  onCancel: () => void;
  onFinish: () => void;
  isFinishing?: boolean;
  finishDisabled?: boolean;
  publishSpaceLocked?: boolean;
};

export function RankingComposeCreateEntityHeader({
  publishSpaceIds,
  publishSpaceId,
  onPublishSpaceIdChange,
  onCancel,
  onFinish,
  isFinishing = false,
  finishDisabled = false,
  publishSpaceLocked = false,
}: Props) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-4 border-b border-divider bg-white px-4 py-1 sm:px-5">
      <RankingComposePublishSpacePicker
        publishSpaceIds={publishSpaceIds}
        publishSpaceId={publishSpaceId}
        onPublishSpaceIdChange={onPublishSpaceIdChange}
        disabled={isFinishing || publishSpaceLocked}
      />
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="secondary"
          small
          disabled={isFinishing}
          onClick={onCancel}
          className="!rounded-full text-grey-04"
        >
          Cancel & delete
        </Button>
        <Button
          variant="primary"
          small
          disabled={finishDisabled || isFinishing}
          onClick={onFinish}
          className="!rounded-full border-grey-02 bg-text text-white hover:bg-text/90 focus-visible:border-text focus-visible:shadow-inner-text"
        >
          {isFinishing ? 'Publishing…' : 'Finish'}
        </Button>
      </div>
    </div>
  );
}
