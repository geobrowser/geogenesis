import styled from '@emotion/styled';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useSigner } from 'wagmi';
import { Signer } from 'ethers';
import pluralize from 'pluralize';
import { Button } from '../design-system/button';
import { Divider } from '../design-system/divider';
import { LeftArrowLong } from '../design-system/icons/left-arrow-long';
import { Trash } from '../design-system/icons/trash';
import { Spacer } from '../design-system/spacer';
import { Text } from '../design-system/text';
import { Toast } from '../design-system/toast';
import { ReviewState } from '../types';
import { Spinner } from '../design-system/spinner';
import { TextButton } from '../design-system/text-button';

const Container = styled.div(props => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  position: 'fixed',
  bottom: props.theme.space * 10,

  backgroundColor: props.theme.colors.white,
  boxShadow: `0px 1px 2px #F0F0F0`,
  padding: props.theme.space * 2,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  borderRadius: props.theme.radius,
}));

const MotionContainer = motion(Container);

interface Props {
  actionsCount: number;
  onPublish: (signer: Signer, setReviewState: (newState: ReviewState) => void) => void;
}

export function FlowBar({ actionsCount, onPublish }: Props) {
  const { data: signer } = useSigner();
  const [reviewState, setReviewState] = useState<ReviewState>('idle');

  // An "edit" is really a delete + create behind the scenes. We don't need to count the
  // deletes since that would double the change count.
  const showFlowBar = reviewState === 'idle' || reviewState === 'reviewing';
  const showToast =
    reviewState === 'publishing-ipfs' || reviewState === 'publishing-contract' || reviewState === 'publish-complete';

  const publish = async () => {
    await onPublish(signer!, setReviewState);
    setReviewState('publish-complete');
    await new Promise(() => setTimeout(() => setReviewState('idle'), 3000)); // want to show the "complete" state for 1s
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
                <Idle actionsCount={actionsCount} onNext={() => setReviewState('reviewing')} />
              )}
              {reviewState === 'reviewing' && (
                <Review actionsCount={actionsCount} onBack={() => setReviewState('idle')} onNext={publish} />
              )}
            </MotionContainer>
          )}
          {showToast && (
            <Toast key="publish-toast">
              {reviewState !== 'publish-complete' ? (
                <Spinner />
              ) : (
                <motion.span initial={{ scale: 0.2 }} animate={{ scale: 1 }} transition={{ bounce: 2 }}>
                  🎉
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

interface IdleProps {
  actionsCount: number;
  onNext: () => void;
}

function Idle({ actionsCount, onNext }: IdleProps) {
  return (
    <>
      <Spacer width={8} />
      <Trash color="grey-04" />
      <Spacer width={8} />
      <Text color="grey-04" variant="button">
        {actionsCount} {pluralize('change', actionsCount)}
      </Text>

      <Spacer width={16} />
      <Divider type="vertical" />
      <Spacer width={16} />

      <Button variant="primary" onClick={onNext} icon="eye">
        Review changes
      </Button>
    </>
  );
}

interface ReviewProps extends IdleProps {
  onBack: () => void;
}

function Review({ actionsCount, onNext, onBack }: ReviewProps) {
  return (
    <>
      <Spacer width={8} />
      <TextButton onClick={onBack}>
        <LeftArrowLong color="grey-04" />
        <Spacer width={8} />
        <Text color="grey-04" variant="button">
          Back
        </Text>
      </TextButton>

      <Spacer width={16} />
      <Divider type="vertical" />
      <Spacer width={16} />

      <Trash color="grey-04" />
      <Spacer width={8} />
      <Text color="grey-04" variant="button">
        {actionsCount} {pluralize('change', actionsCount)}
      </Text>

      <Spacer width={16} />
      <Divider type="vertical" />
      <Spacer width={16} />

      <Text variant="button">Happy with these changes?</Text>

      <Spacer width={16} />

      <Button variant="primary" onClick={onNext} icon="publish">
        Publish
      </Button>
    </>
  );
}
