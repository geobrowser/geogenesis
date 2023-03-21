'use client';

import * as React from 'react';
import { useState } from 'react';
import clsx from 'classnames';
import BoringAvatar from 'boring-avatars';
import pluralize from 'pluralize';
import { useAccount } from 'wagmi';
import { AnimatePresence, motion } from 'framer-motion';

import { EntityPresenceContext } from './entity-presence-provider';
import { Text } from '~/modules/design-system/text';
import { SmallButton } from '~/modules/design-system/button';
import { Spacer } from '~/modules/design-system/spacer';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { ResizableContainer } from '~/modules/design-system/resizable-container';

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export function EntityOthersToast() {
  const account = useAccount();
  const [isExpanded, setIsExpanded] = useState(false);
  const others = EntityPresenceContext.useOthers();
  const [me] = EntityPresenceContext.useMyPresence();

  // Include me in the list of editors
  const editors = [
    ...others,
    {
      // Set Other properties to me's address. We can use this later to
      // differentiate between the active tab me and others in the editor list.
      id: me.address,
      connectionId: me.address,
      presence: {
        address: me.address,
        hasChangesToEntity: me.hasChangesToEntity,
      },
    },
  ]
    .filter(e => e.presence.hasChangesToEntity)
    // Filter out myself if I am the only editor and I'm in the current tab being edited
    .filter((e, _, filteredEditors) => {
      if (filteredEditors.length === 1 && e.connectionId === account.address) return false;
      return true;
    });

  // We only show the first 3 avatars in the avatar group
  const editorsAvatars = editors.slice(0, 3);
  const editorsCount = editors.length;
  const shouldShow = editorsCount > 0;

  return (
    <AnimatePresence>
      {shouldShow ? (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 15 }}
          transition={{ duration: 0.15 }}
          className="fixed right-8 bottom-8 w-60 rounded border border-grey-02 bg-white p-3 shadow-lg"
        >
          <div className="flex items-center gap-2">
            <ul className="flex items-center -space-x-1">
              {editorsAvatars.map((editor, i) => (
                <li key={editor.id} className={clsx({ 'rounded-full border border-white': i !== 0 })}>
                  <BoringAvatar size={16} name={editor.presence.address} variant="pixel" />
                </li>
              ))}
            </ul>
            <Text variant="metadataMedium">
              {editorsCount >= 3 ? '3+' : editorsCount} {pluralize('user', editorsCount)}{' '}
              {editorsCount > 1 ? 'are' : 'is'} editing now
            </Text>
          </div>
          <Spacer height={8} />
          <ResizableContainer duration={0.15}>
            {isExpanded ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ul key="presence-user-list" className="mb-2 space-y-3 overflow-hidden">
                  {editors.map(editor => (
                    <li key={editor.connectionId} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BoringAvatar size={16} name={me.address} variant="pixel" />
                        <Text variant="metadata" color="grey-04">
                          {shortAddress(editor.presence.address ?? '')}
                        </Text>
                      </div>
                      {editor.presence.address === account?.address && (
                        <Text className="rounded bg-grey-02 px-1" color="grey-04" variant="footnoteMedium">
                          You
                        </Text>
                      )}
                    </li>
                  ))}
                </ul>
                <Spacer height={4} />
              </motion.div>
            ) : null}
          </ResizableContainer>
          <SmallButton variant="secondary" onClick={() => setIsExpanded(!isExpanded)}>
            <span style={{ rotate: isExpanded ? '180deg' : '0deg' }}>
              <ChevronDownSmall color="grey-04" />
            </span>
            <Spacer width={6} />
            {isExpanded ? `Hide ${pluralize('editor', editorsCount)}` : `View ${pluralize('editor', editorsCount)}`}
          </SmallButton>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
