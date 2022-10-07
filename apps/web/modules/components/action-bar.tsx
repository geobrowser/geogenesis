import styled from '@emotion/styled';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../design-system/button';
import { Spacer } from '../design-system/spacer';
import { Text } from '../design-system/text';
import { useTriples } from '../state/hook';

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
  margin: '0 auto',
}));

const MotionContainer = motion(Container);

export function ActionBar() {
  const { changedTriples } = useTriples();

  const changeCount = changedTriples.length;

  return (
    <AnimatePresence>
      {changeCount > 0 ? (
        <MotionContainer
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{
            opacity: { duration: 0.4 },
          }}
          key="action-bar-container"
        >
          <Spacer width={8} />
          <Text color="grey-04" variant="button">
            {changeCount} changes
          </Text>
          <Spacer width={16} />
          <Button variant="primary" onClick={() => {}}>
            Review changes
          </Button>
        </MotionContainer>
      ) : null}
    </AnimatePresence>
  );
}
