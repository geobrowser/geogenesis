import { useTheme } from '@emotion/react';
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
import { ReviewState, Triple } from '../types';
import { Spinner } from '../design-system/spinner';
import { Action } from '../state/triple-store';

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
  changedTriples: Action[];
  onPublish: (signer: Signer, setReviewState: (newState: ReviewState) => void) => void;
}

export function FlowBar({ changedTriples, onPublish }: Props) {
  const { data: signer } = useSigner();
  const [reviewState, setReviewState] = useState<ReviewState>('idle');

  // An "edit" is really a delete + create behind the scenes. We don't need to count the
  // deletes since that would double the change count.
  const changeCount = changedTriples.length;
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
      {changeCount > 0 || reviewState === 'publish-complete' ? (
        <>
          {showFlowBar && (
            <MotionContainer
              initial={{ y: 90 }}
              animate={{ y: 0 }}
              exit={{ y: 90 }}
              transition={{ duration: 0.1, ease: 'easeInOut' }}
              key="action-bar"
            >
              {reviewState === 'idle' && <Idle changeCount={changeCount} onNext={() => setReviewState('reviewing')} />}
              {reviewState === 'reviewing' && (
                <Review changeCount={changeCount} onBack={() => setReviewState('idle')} onNext={publish} />
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
              {reviewState === 'publishing-contract' && 'Uploading changes to IPFS'}
              {reviewState === 'publish-complete' && 'Changes published!'}
            </Toast>
          )}
        </>
      ) : null}
    </AnimatePresence>
  );
}

interface IdleProps {
  changeCount: number;
  onNext: () => void;
}

function Idle({ changeCount, onNext }: IdleProps) {
  const theme = useTheme();

  return (
    <>
      <Spacer width={8} />
      <Trash color={theme.colors['grey-04']} />
      <Spacer width={8} />
      <Text color="grey-04" variant="button">
        {changeCount} {pluralize('change', changeCount)}
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

const TextButton = styled.button(props => ({
  display: 'flex',
  alignItems: 'center',

  border: 'none',
  backgroundColor: props.theme.colors.white,
  cursor: 'pointer',

  ':hover': {
    border: `inset 0 0 0 1px ${props.theme.colors.ctaPrimary}`,
  },

  ':focus': {
    boxShadow: `inset 0 0 0 2px ${props.theme.colors.ctaPrimary}`,
    outline: 'none',
  },
}));

interface ReviewProps extends IdleProps {
  onBack: () => void;
}

function Review({ changeCount, onNext, onBack }: ReviewProps) {
  const theme = useTheme();

  return (
    <>
      <Spacer width={8} />
      <TextButton onClick={onBack}>
        <LeftArrowLong color={theme.colors['grey-04']} />
        <Spacer width={8} />
        <Text color="grey-04" variant="button">
          Back
        </Text>
      </TextButton>

      <Spacer width={16} />
      <Divider type="vertical" />
      <Spacer width={16} />

      <Trash color={theme.colors['grey-04']} />
      <Spacer width={8} />
      <Text color="grey-04" variant="button">
        {changeCount} {pluralize('change', changeCount)}
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
