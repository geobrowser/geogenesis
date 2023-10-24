'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import Image from 'next/legacy/image';
import { useRouter } from 'next/navigation';

import * as React from 'react';

import { useWalletClient } from 'wagmi';

import { useEntityPageStore } from '~/core/hooks/use-entity-page-store';
import { useMoveTriplesState } from '~/core/hooks/use-move-triples-state';
import { usePublish } from '~/core/hooks/use-publish';
import { useSpaces } from '~/core/hooks/use-spaces';
import { useMoveEntity } from '~/core/state/move-entity-store';
import { CreateTripleAction, DeleteTripleAction, ReviewState } from '~/core/types';
import { getImagePath, sleepWithCallback } from '~/core/utils/utils';

import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { Divider } from '~/design-system/divider';
import { Icon } from '~/design-system/icon';
import { Warning } from '~/design-system/icons/warning';
import { SlideUp } from '~/design-system/slide-up';
import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

import { MoveEntityReviewPage } from './move-entity-review-page';

export function MoveEntityReview() {
  const { isMoveReviewOpen, setIsMoveReviewOpen } = useMoveEntity();
  return (
    <SlideUp isOpen={isMoveReviewOpen} setIsOpen={setIsMoveReviewOpen}>
      {/* added the overflow classes up here to make sure mobile devices can scroll for longer content in the Entity Review UI */}
      <div className="h-full overflow-y-auto overscroll-contain">
        <MoveEntityReviewChanges />
      </div>
    </SlideUp>
  );
}

function MoveEntityReviewChanges() {
  const { spaceIdFrom, spaceIdTo, entityId, setIsMoveReviewOpen } = useMoveEntity();
  const { spaces } = useSpaces();
  const spaceFrom = spaces.find(space => space.id === spaceIdFrom);
  const spaceTo = spaces.find(space => space.id === spaceIdTo);
  const { triples } = useEntityPageStore();
  const { makeProposal } = usePublish();
  const { state: createState, dispatch: createDispatch } = useMoveTriplesState();
  const { state: deleteState, dispatch: deleteDispatch } = useMoveTriplesState();
  const [firstPublishComplete, setFirstPublishComplete] = React.useState(false); // to allow the user to reenter only the second publish
  const router = useRouter();

  const { data: wallet } = useWalletClient(); // user wallet session

  const handlePublish = React.useCallback(async () => {
    if (!wallet || !spaceIdFrom || !spaceIdTo) {
      return;
    }

    const onDeleteTriples = (): DeleteTripleAction[] => {
      return triples.map(t => ({
        ...t,
        type: 'deleteTriple',
      }));
    };

    const onCreateNewTriples = (): CreateTripleAction[] => {
      return triples.map(t => ({
        ...t,
        type: 'createTriple',
        space: spaceIdTo,
      }));
    };

    const createProposalName = `Create ${triples[0]?.entityName ?? entityId} in ${spaceTo?.attributes[
      SYSTEM_IDS.NAME
    ]}`;
    const deleteProposalName = `Delete ${triples[0]?.entityName ?? entityId} from ${spaceFrom?.attributes[
      SYSTEM_IDS.NAME
    ]}`;

    let createActions: CreateTripleAction[] = [];
    let deleteActions: DeleteTripleAction[] = [];

    try {
      if (!firstPublishComplete) {
        createActions = onCreateNewTriples();

        await makeProposal({
          actions: createActions,
          name: createProposalName,
          onChangePublishState: reviewState => createDispatch({ type: 'SET_REVIEW_STATE', payload: reviewState }),
          spaceId: spaceIdTo,
        });
        createDispatch({ type: 'SET_REVIEW_STATE', payload: 'publish-complete' });
        setFirstPublishComplete(true); // so the user can re-enter the second publish only if this succeeds
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        if (e.message.startsWith('Publish failed: TransactionExecutionError: User rejected the request.')) {
          createActions = []; // reset the create actions so there aren't duplicates
          createDispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
          return;
        }
        createDispatch({ type: 'ERROR', payload: e.message });
      }
      return; // Return because the first publish failed -- user will see error state in the UI
    }

    try {
      deleteActions = onDeleteTriples();

      await makeProposal({
        actions: deleteActions,
        name: deleteProposalName,
        onChangePublishState: reviewState => deleteDispatch({ type: 'SET_REVIEW_STATE', payload: reviewState }),
        spaceId: spaceIdFrom,
      });
      deleteDispatch({ type: 'SET_REVIEW_STATE', payload: 'publish-complete' });
    } catch (e: unknown) {
      if (e instanceof Error) {
        if (e.message.startsWith('Publish failed: TransactionExecutionError: User rejected the request.')) {
          deleteActions = []; // reset the delete actions so there aren't duplicates when user retries
          deleteDispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
          return;
        }
        deleteDispatch({ type: 'ERROR', payload: e.message });
      }
      return; // Return because the second publish failed -- user will see error state in the UI
    }
    // close the review UI after displaying the state messages for 2 seconds
    await sleepWithCallback(() => {
      setIsMoveReviewOpen(false);
      router.push(`/space/${spaceIdTo}`);
    }, 2000);
  }, [
    wallet,
    spaceIdFrom,
    spaceIdTo,
    triples,
    entityId,
    spaceTo?.attributes,
    spaceFrom?.attributes,
    firstPublishComplete,
    makeProposal,
    createDispatch,
    deleteDispatch,
    router,
    setIsMoveReviewOpen,
  ]);

  // maps the review state to a background color class (used in the ProgressBar component)
  const getBgClassByState = (index: number, state: ReviewState) => {
    let stateValue = 0;
    switch (state) {
      case 'idle':
        stateValue = 0;
        break;
      case 'publishing-ipfs':
        stateValue = 1;
        break;
      case 'signing-wallet':
        stateValue = 2;
        break;
      case 'publishing-contract':
        stateValue = 3;
        break;
      case 'publish-complete':
        stateValue = 4;
        break;
      default:
        stateValue = 0;
        break;
    }
    return state === 'idle' ? 'bg-grey-02' : index <= stateValue ? 'bg-text' : 'bg-grey-02'; // handle the idle case and then the rest
  };

  return (
    <>
      <div className="flex w-full items-center justify-between gap-1 bg-white px-4 py-1 shadow-big md:px-4 md:py-3">
        <div className="inline-flex items-center gap-4">
          <SquareButton onClick={() => setIsMoveReviewOpen(false)} icon="close" />
          <Text variant="metadataMedium">Move entities</Text>
        </div>
        <div>
          <Button onClick={handlePublish}>Publish and move</Button>
        </div>
      </div>
      <div className="mt-3 h-full rounded-t-[16px] bg-bg shadow-big ">
        <div className="mx-auto max-w-[1200px] pb-20 pt-10 xl:pb-[4ch] xl:pl-[2ch] xl:pr-[2ch] xl:pt-[40px] ">
          <div className="flex w-full flex-row items-center justify-between gap-4 sm:flex-col">
            <SpaceMoveCard
              spaceName={spaceTo?.attributes[SYSTEM_IDS.NAME]}
              spaceImage={spaceTo?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE]}
              actionType="create"
              txState={createState.reviewState}
              handlePublish={handlePublish}
              getBgClassByState={getBgClassByState}
            />
            <Icon icon="rightArrowLongSmall" color="grey-04" />
            <SpaceMoveCard
              spaceName={spaceFrom?.attributes[SYSTEM_IDS.NAME]}
              spaceImage={spaceFrom?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE]}
              actionType="delete"
              txState={deleteState.reviewState}
              handlePublish={handlePublish}
              getBgClassByState={getBgClassByState}
            />
          </div>
          <div className="flex flex-col gap-1 py-6">
            <Text variant="body">Entity to move</Text>
            <Text className="text-bold text-mediumTitle sm:text-smallTitle">{triples[0]?.entityName ?? entityId}</Text>
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
  txState,
  handlePublish,
  getBgClassByState,
}: {
  spaceName: string | undefined; // to satisfy potentially undefined
  spaceImage: string | undefined; // to satisfy potentially undefined
  actionType: 'delete' | 'create';
  txState: ReviewState;
  handlePublish: () => void;
  getBgClassByState: (index: number, state: ReviewState) => string;
}) {
  return (
    <div className="flex w-full basis-3/5 flex-col gap-3 rounded border border-grey-02 px-4 py-5">
      <div className="flex flex-row items-center justify-between gap-2">
        <Text variant="metadata">
          Step {actionType === 'create' ? 1 : 2} &middot; {actionType === 'create' ? 'Create' : 'Delete'} triples
        </Text>
        <div className="flex flex-row items-center gap-2">
          {spaceImage !== undefined && (
            <div className="relative h-[16px] w-[16px] overflow-hidden rounded-xs">
              <Image src={getImagePath(spaceImage)} layout="fill" objectFit="cover" />
            </div>
          )}
          <Text variant="metadata">{spaceName}</Text>
        </div>
      </div>
      <Divider type="horizontal" />
      <div className="flex flex-row items-center justify-between gap-2">
        <StatusMessage txState={txState} handlePublish={handlePublish} />
        <div className="flex flex-row items-center gap-1.5">
          <ProgressBar txState={txState} getBgClassByState={getBgClassByState} />
        </div>
      </div>
    </div>
  );
}

function StatusMessage({ txState, handlePublish }: { txState: ReviewState; handlePublish: () => void }) {
  const reviewStateText: Record<ReviewState, string> = {
    idle: 'Not Started',
    reviewing: '', // added to satisfy the type -- @TODO can omit with a string enum version of ReviewState
    'publishing-ipfs': 'Uploading changes to IPFS',
    'signing-wallet': 'Sign your transaction',
    'publishing-contract': 'Adding changes to the blockchain',
    'publish-complete': 'Changes published!',
    'publish-error': 'An error has occurred',
  };

  return (
    <div className="flex flex-row items-center gap-3">
      {txState === 'idle' ? <IdleCircle /> : null}
      {txState === 'publishing-ipfs' || txState === 'signing-wallet' || txState === 'publishing-contract' ? (
        <Spinner />
      ) : null}
      {txState === 'publish-complete' ? <Icon icon="checkCircle" color="green" /> : null}
      {txState === 'publish-error' ? (
        <div className="flex flex-row items-center">
          <Warning color="red-01" />
        </div>
      ) : null}
      <Text variant="metadata">{reviewStateText[txState]}</Text>
      {txState === 'publish-error' ? (
        <div className="flex flex-row items-center gap-1.5">
          <SmallButton icon="retrySmall" color="white" className="bg-white text-grey-04" onClick={handlePublish}>
            Re-try
          </SmallButton>
        </div>
      ) : null}
    </div>
  );
}

function ProgressBar({
  txState,
  getBgClassByState,
}: {
  txState: ReviewState;
  getBgClassByState: (index: number, state: ReviewState) => string;
}) {
  return (
    <div className="flex flex-row items-center gap-1.5">
      {[0, 1, 2, 3].map(index => (
        <div key={index} className={`h-[6px] w-[30px] rounded-[30px] ${getBgClassByState(index, txState)}`} />
      ))}
    </div>
  );
}

function IdleCircle() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="7.5" stroke="#FFA134" />
    </svg>
  );
}
