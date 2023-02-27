import * as React from 'react';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { SmallButton } from '~/modules/design-system/button';
import { Tick } from '~/modules/design-system/icons/tick';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';

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
          <motion.span
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
          >
            <Text color="white" variant="smallButton" className="inline-flex items-center">
              <Tick />
              <Spacer width={4} />
              {copyText}
            </Text>
          </motion.span>
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
