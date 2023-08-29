import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/legacy/image';

import { useCallback, useEffect } from 'react';

import { useWalletClient } from 'wagmi';

import { Environment } from '~/core/environment';
import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useEntityPageStore } from '~/core/hooks/use-entity-page-store';
import { useReviewState } from '~/core/hooks/use-review-state';
import { useSpaces } from '~/core/hooks/use-spaces';
import { Subgraph } from '~/core/io';
import { Services } from '~/core/services';
import { useMoveEntity } from '~/core/state/move-entity-store';
// import { useStatusBar } from '~/core/state/status-bar-store';
import { DeleteTripleAction } from '~/core/types';
import { Triple } from '~/core/types';
import { getImagePath } from '~/core/utils/utils';

import { Button, SquareButton } from '~/design-system/button';
import { Divider } from '~/design-system/divider';
import { Icon } from '~/design-system/icon';
import { SlideUp } from '~/design-system/slide-up';
import { Text } from '~/design-system/text';

import { MoveEntityReviewPage } from './move-entity-review-page';

export function MoveEntityReview() {
  const { isMoveReviewOpen, setIsMoveReviewOpen } = useMoveEntity();
  return (
    <SlideUp isOpen={isMoveReviewOpen} setIsOpen={setIsMoveReviewOpen}>
      <MoveEntityReviewChanges />
    </SlideUp>
  );
}

function MoveEntityReviewChanges() {
  const { spaceIdFrom, spaceIdTo, entityId, setIsMoveReviewOpen } = useMoveEntity();
  const { spaces } = useSpaces();
  const spaceFrom = spaces.find(space => space.id === spaceIdFrom);
  const spaceTo = spaces.find(space => space.id === spaceIdTo);
  const { triples } = useEntityPageStore();
  const { publish, create, remove } = useActionsStore();
  const { state: createState, dispatch: createDispatch } = useReviewState();
  const { state: deleteState, dispatch: deleteDispatch } = useReviewState();

  const { data: wallet } = useWalletClient(); // user wallet session

  const handlePublish = useCallback(async () => {
    console.log('handlePublish called');

    if (!wallet || !spaceIdFrom || !spaceIdTo) {
      console.log('Early return due to missing required values');
      return;
    }

    const onDeleteTriples = () => {
      console.log('Inside onDeleteTriples');
      console.log('deleting the triples');
      const deleteActions: DeleteTripleAction[] = triples.map(t => ({
        ...t,
        type: 'deleteTriple',
      }));
      deleteActions.map(action => remove(action));
    };

    const onCreateNewTriples = () => {
      console.log('Inside onCreateNewTriples');
      console.log('creating the triples');
      const createActions: Triple[] = triples.map(t => ({
        ...t,
        type: 'createTriple',
        space: spaceIdTo,
      }));
      createActions.map(action => create(action));
    };

    const createProposalName = `Create ${entityId} from ${spaceIdFrom}`;
    const deleteProposalName = `Delete ${entityId} from ${spaceIdFrom}`;

    try {
      console.log('Attempting to run onCreateNewTriples');
      onCreateNewTriples();

      console.log('Attempting first publish');
      await publish(
        spaceIdTo,
        wallet,
        reviewState => createDispatch({ type: 'SET_REVIEW_STATE', payload: reviewState }),
        {},
        createProposalName
      );
      console.log('First publish successful:', createState.reviewState);
    } catch (e: unknown) {
      console.log('An error occurred in the first publish', e);
      if (e instanceof Error) {
        createDispatch({ type: 'ERROR', payload: e.message });
      }
      return; // Early return because the first operation failed
    }

    try {
      console.log('Attempting to run onDeleteTriples');
      onDeleteTriples();

      console.log('Attempting second publish');
      await publish(
        spaceIdFrom,
        wallet,
        reviewState => deleteDispatch({ type: 'SET_REVIEW_STATE', payload: reviewState }),
        {},
        deleteProposalName
      );
      deleteDispatch({ type: 'SET_REVIEW_STATE', payload: 'publish-complete' });

      if (createState.reviewState === 'publish-complete' && deleteState.reviewState === 'publish-complete') {
        console.log('both are successful, closing the review modal');
        setIsMoveReviewOpen(false);
      }
    } catch (e: unknown) {
      console.log('An error occurred in the second publish', e);
      if (e instanceof Error) {
        deleteDispatch({ type: 'ERROR', payload: e.message });
      }
    }
  }, [
    wallet,
    spaceIdFrom,
    spaceIdTo,
    entityId,
    triples,
    remove,
    create,
    publish,
    createState.reviewState,
    createDispatch,
    deleteDispatch,
    deleteState.reviewState,
    setIsMoveReviewOpen,
  ]);

  return (
    <>
      <div className="flex w-full items-center justify-between gap-1 bg-white py-1 px-4 shadow-big md:py-3 md:px-4">
        <div className="inline-flex items-center gap-4">
          <SquareButton onClick={() => setIsMoveReviewOpen(false)} icon="close" />
          <Text variant="metadataMedium">Move entities</Text>
        </div>
        <div>
          <Button onClick={handlePublish}>Publish and move</Button>
        </div>
      </div>
      <div className="mt-3 h-full overflow-y-auto overscroll-contain rounded-t-[16px] bg-bg shadow-big">
        <div className="mx-auto max-w-[1200px] pt-10 pb-20 xl:pt-[40px] xl:pr-[2ch] xl:pb-[4ch] xl:pl-[2ch]">
          <p>create state: {createState.reviewState}</p>
          <p>delete state: {deleteState.reviewState}</p>
          <div className="flex flex-row items-center justify-between gap-4 w-full ">
            <SpaceMoveCard
              spaceName={spaceFrom?.attributes[SYSTEM_IDS.NAME]}
              spaceImage={spaceFrom?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE]}
              actionType="create"
            />
            <Icon icon="rightArrowLongSmall" color="grey-04" />
            <SpaceMoveCard
              spaceName={spaceTo?.attributes[SYSTEM_IDS.NAME]}
              spaceImage={spaceTo?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE]}
              actionType="delete"
            />
          </div>
          <div className="flex flex-col gap-1 py-6">
            <Text variant="body">Entity to move</Text>
            <Text variant="mediumTitle" className="text-bold">
              {triples[0]?.entityName ?? entityId}
              {/* {entityData.name} */}
              {/* {triples.find(t => t.)} */}
            </Text>
          </div>
          <MoveEntityReviewPage entityId={entityId} triples={triples} />
        </div>
      </div>
    </>
  );
}

function SpaceMoveCard({
  spaceName,
  spaceImage,
  actionType,
}: {
  spaceName: string | undefined; // to satisfiy potentially undefined
  spaceImage: string | undefined; // to satisfy potentially undefined
  actionType: 'delete' | 'create';
}) {
  // use the useStatusBar review states in the card to show the status of the move
  // @TODO: rethinking the component structure with the new states
  const { state: createState } = useReviewState();
  const { state: deleteState } = useReviewState();
  return (
    <div className="flex flex-col border border-grey-02 rounded px-4 py-5 basis-3/5 w-full gap-3">
      <div className="flex flex-row items-center justify-between gap-2">
        <Text variant="metadata">
          Step {actionType === 'create' ? 1 : 2} &middot; {actionType === 'create' ? 'Create' : 'Delete'} triples
        </Text>
        {spaceImage !== undefined && (
          <div className="relative w-[32px] h-[32px] rounded-xs overflow-hidden">
            <Image src={getImagePath(spaceImage)} layout="fill" objectFit="cover" />
          </div>
        )}

        <Text variant="metadata">{spaceName}</Text>
      </div>
      <Divider type="horizontal" />
      <div className="flex flex-row items-center gap-2">
        <p>state: {actionType === 'create' ? createState.reviewState : deleteState.reviewState}</p>
        {/* {state.reviewState === 'idle' ? (
          <div className="flex flex-row gap-3">
            <Icon icon="checkClose" color="grey-04" />
            <Text variant="metadata" color="grey-04">
              Not started
            </Text>
          </div>
        ) : null} */}
      </div>
    </div>
  );
}
