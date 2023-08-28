import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/legacy/image';

import { useCallback } from 'react';

import { useWalletClient } from 'wagmi';

import { Environment } from '~/core/environment';
import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useEntityPageStore } from '~/core/hooks/use-entity-page-store';
import { useSpaces } from '~/core/hooks/use-spaces';
import { Subgraph } from '~/core/io';
import { Services } from '~/core/services';
import { useMoveEntity } from '~/core/state/move-entity-store';
import { useStatusBar } from '~/core/state/status-bar-store';
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
  const { publish, create, remove, actionsFromSpace } = useActionsStore();

  const { dispatch } = useStatusBar();

  const { data: wallet } = useWalletClient(); // user wallet session

  console.log('existing triples', triples);
  const handlePublish = useCallback(async () => {
    console.log('existing triples', triples);
    if (!wallet || !spaceIdFrom || !spaceIdTo) return;
    const onDeleteTriples = () => {
      const deleteActions: DeleteTripleAction[] = triples.map(t => ({
        ...t,
        type: 'deleteTriple',
      }));
      // add the remove actions to the action store
      deleteActions.map(action => remove(action));
      console.log('delete', actionsFromSpace);
    };

    const onCreateNewTriples = () => {
      const createActions: Triple[] = triples.map(t => ({
        ...t,
        type: 'createTriple',
        space: spaceIdTo, // the space that the triples are going to
      }));

      // add the create actions to the action store
      createActions.map(action => create(action));
      console.log('create', actionsFromSpace);
    };
    // set the proposal name for the delete step
    const createProposalName = `Create ${entityId} from ${spaceIdFrom}`;

    // set the proposal name for the delete step
    const deleteProposalName = `Delete ${entityId} from ${spaceIdFrom}`;

    const createPublish = async () =>
      await publish(
        spaceIdTo,
        wallet,
        reviewState => dispatch({ type: 'SET_REVIEW_STATE', payload: reviewState }),
        {},
        createProposalName
      );

    const deletePublish = async () =>
      await publish(
        spaceIdFrom,
        wallet,
        reviewState => dispatch({ type: 'SET_REVIEW_STATE', payload: reviewState }),
        {},
        deleteProposalName
      );

    /*
  steps:
    1) create the new triples in the new space
    2) publish the new triples (handle any errors)
    3) on successful publish
    4) delete the old triples
    5) on successful publish (handle any errors here)
    - iterate through both sets of new triples and do the create and delete from the action store (syncs the local data and updates the bus)
   */
    // 1) create the new triples in the new space
    // 2) publish the new triples (handle any errors)
    try {
      // create the new triples in new space
      onCreateNewTriples();
      // publish the changes
      createPublish();
      // delete the old triples
      onDeleteTriples();
      // publish the changes
      deletePublish();
    } catch (e: unknown) {
      if (e instanceof Error) {
        if (e.message.startsWith('Publish failed: TransactionExecutionError: User rejected the request.')) {
          dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
          return;
        }

        dispatch({ type: 'ERROR', payload: e.message });
      }
    }
  }, [triples, wallet, spaceIdFrom, spaceIdTo, entityId, actionsFromSpace, remove, create, publish, dispatch]);

  const useEntity = (entityId: string) => {
    const { subgraph, config } = Services.useServices();
    const { data: entityData, isLoading: entityIsLoading } = useQuery({
      queryKey: [`moveEntity:${entityId}`],
      queryFn: async () => getEntityById(entityId, subgraph, config),
    });
    return { entityData, entityIsLoading } as const;
  };

  // this comes from the subgraph, need also to reconcile with local entity in the entity store
  const getEntityById = async (entityId: string, subgraph: Subgraph.ISubgraph, config: Environment.AppConfig) => {
    const entity = await subgraph.fetchEntity({ id: entityId, endpoint: config.subgraph });
    return entity;
  };

  const { entityData, entityIsLoading } = useEntity(entityId);

  if (!entityData || entityIsLoading) {
    return null;
  }

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
          <div className="flex flex-row items-center justify-between gap-4 w-full ">
            <SpaceMoveCard
              spaceName={spaceFrom?.attributes[SYSTEM_IDS.NAME]}
              spaceImage={spaceFrom?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE]}
              actionType="delete"
            />
            <Icon icon="rightArrowLongSmall" color="grey-04" />
            <SpaceMoveCard
              spaceName={spaceTo?.attributes[SYSTEM_IDS.NAME]}
              spaceImage={spaceTo?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE]}
              actionType="create"
            />
          </div>
          <div className="flex flex-col gap-1 py-6">
            <Text variant="body">Entity to move</Text>
            <Text variant="mediumTitle" className="text-bold">
              {entityData.name}
            </Text>
          </div>
          <MoveEntityReviewPage entityId={entityId} triples={entityData.triples} />
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
  const { state } = useStatusBar();
  return (
    <div className="flex flex-col border border-grey-02 rounded px-4 py-5 basis-3/5 w-full gap-3">
      <div className="flex flex-row items-center justify-between gap-2">
        <Text variant="metadata">Step - {actionType === 'create' ? 'Create' : 'Delete'} Triples</Text>
        {spaceImage !== undefined && (
          <div className="relative w-[32px] h-[32px] rounded-xs overflow-hidden">
            <Image src={getImagePath(spaceImage)} layout="fill" objectFit="cover" />
          </div>
        )}

        <Text variant="metadata">{spaceName}</Text>
      </div>
      <Divider type="horizontal" />
      <div className="flex flex-row items-center gap-2">
        {state.reviewState === 'idle' ? (
          <div className="flex flex-row gap-3">
            <Icon icon="checkClose" color="grey-04" />
            <Text variant="metadata" color="grey-04">
              Not started
            </Text>
          </div>
        ) : null}
      </div>
    </div>
  );
}
