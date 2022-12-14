import styled from '@emotion/styled';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useSigner } from 'wagmi';
import { Signer } from 'ethers';
import pluralize from 'pluralize';
import { Button } from '../design-system/button';
import { Trash } from '../design-system/icons/trash';
import { Spacer } from '../design-system/spacer';
import { Text } from '../design-system/text';
import { Toast } from '../design-system/toast';
import { Action as ActionType, ReviewState } from '../types';
import { Spinner } from '../design-system/spinner';
import { groupBy } from '../utils';
import { Action } from '../action';

const Container = styled.div(props => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  position: 'fixed',
  bottom: props.theme.space * 10,

  backgroundColor: props.theme.colors.white,
  boxShadow: `0px 1px 2px #F0F0F0`,
  padding: props.theme.space * 2,
  paddingLeft: props.theme.space * 4,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  borderRadius: props.theme.radius,
}));

const MotionContainer = motion(Container);

interface Props {
  actions: ActionType[];
  spaceId?: string;
  onPublish: (spaceId: string, signer: Signer, setReviewState: (newState: ReviewState) => void) => void;
  onClear: (spaceId: string) => void;
}

export function FlowBar({ actions, onPublish, onClear, spaceId }: Props) {
  const { data: signer } = useSigner();
  const [reviewState, setReviewState] = useState<ReviewState>('idle');

  // An "edit" is really a delete + create behind the scenes. We don't need to count the
  // deletes since that would double the change count.
  const showFlowBar = reviewState === 'idle';
  const showToast =
    reviewState === 'publishing-ipfs' || reviewState === 'publishing-contract' || reviewState === 'publish-complete';

  const actionsCount = Action.getChangeCount(actions);

  const publish = async () => {
    if (!spaceId || !signer) return;

    await onPublish(spaceId, signer, setReviewState);
  };

  const clear = () => {
    if (!spaceId) return;
    onClear(spaceId);
  };

  return (
    <AnimatePresence>
      {/* We let the toast persist during the publish-complete state before it switches to idle state */}
      {actionsCount > 0 || reviewState === 'publish-complete' ? (
        <>
          {showFlowBar && (
            <MotionContainer
              initial={{ y: 90 }}
              animate={{ y: 0 }}
              exit={{ y: 90 }}
              transition={{ duration: 0.1, ease: 'easeInOut' }}
              key="action-bar"
            >
              {reviewState === 'idle' && (
                <Review actions={actions} onBack={() => setReviewState('idle')} onNext={publish} onClear={clear} />
              )}
            </MotionContainer>
          )}
          {showToast && (
            <Toast key="publish-toast">
              {reviewState !== 'publish-complete' ? (
                <Spinner />
              ) : (
                <motion.span initial={{ scale: 0.2 }} animate={{ scale: 1 }} transition={{ bounce: 2 }}>
                  ????
                </motion.span>
              )}
              <Spacer width={12} />
              {reviewState === 'publishing-ipfs' && 'Uploading changes to IPFS'}
              {reviewState === 'publishing-contract' && 'Adding your changes to the blockchain'}
              {reviewState === 'publish-complete' && 'Changes published!'}
            </Toast>
          )}
        </>
      ) : null}
    </AnimatePresence>
  );
}

interface ReviewProps {
  onBack: () => void;
  actions: ActionType[];
  onNext: () => void;
  onClear: () => void;
}

const TrashButton = styled.button({
  all: 'unset',
  cursor: 'pointer',
});

function Review({ actions, onNext, onClear }: ReviewProps) {
  const actionsCount = Action.getChangeCount(actions);
  const entitiesCount = Object.keys(
    groupBy(Action.squashChanges(actions), action => {
      if (action.type === 'deleteTriple' || action.type === 'createTriple') return action.entityId;
      return action.after.entityId;
    })
  ).length;

  return (
    <>
      <TrashButton onClick={onClear}>
        <Trash color="grey-04" />
      </TrashButton>
      <Spacer width={8} />
      <Text color="grey-04" variant="button">
        {actionsCount} {pluralize('change', actionsCount)} across {entitiesCount} {pluralize('entity', entitiesCount)}
      </Text>

      <Spacer width={16} />

      <Button icon="eye" variant="primary" onClick={onNext}>
        Publish changes
      </Button>
    </>
  );
}
