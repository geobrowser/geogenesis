import styled from '@emotion/styled';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { SmallButton } from '~/modules/design-system/button';
import { Tick } from '~/modules/design-system/icons/tick';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';

const CopyText = styled(Text)`
  display: inline-flex;
  align-items: center;
`;

const MotionCopyText = motion(CopyText);

export function CopyIdButton({ id }: { id: string }) {
  const [copyText, setCopyText] = useState<'Copy ID' | 'Entity ID Copied'>('Copy ID');

  const onCopyEntityId = () => {
    navigator.clipboard.writeText(id);
    setCopyText('Entity ID Copied');
    setTimeout(() => setCopyText('Copy ID'), 3600);
  };

  return (
    <SmallButton
      onClick={onCopyEntityId}
      variant={copyText === 'Entity ID Copied' ? 'tertiary' : 'secondary'}
      icon={copyText === 'Entity ID Copied' ? undefined : 'copy'}
    >
      <AnimatePresence mode="wait">
        {copyText === 'Entity ID Copied' ? (
          <MotionCopyText
            color="white"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            variant="smallButton"
          >
            <Tick />
            <Spacer width={4} />
            {copyText}
          </MotionCopyText>
        ) : (
          <motion.span
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
          >
            {copyText}
          </motion.span>
        )}
      </AnimatePresence>
    </SmallButton>
  );
}
