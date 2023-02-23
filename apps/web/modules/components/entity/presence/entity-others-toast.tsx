import { useState } from 'react';
import BoringAvatar from 'boring-avatars';
import pluralize from 'pluralize';
import clsx from 'classnames';
import { EntityPresenceContext } from './entity-presence-provider';
import { Text } from '~/modules/design-system/text';
import { SmallButton } from '~/modules/design-system/button';
import { Spacer } from '~/modules/design-system/spacer';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { AnimatePresence, motion } from 'framer-motion';
import { ResizableContainer } from '~/modules/design-system/resizable-container';
import { useAccount } from 'wagmi';

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
      id: me.address,
      connectionId: me.address,
      presence: {
        address: me.address,
      },
    },
  ];

  // We only show the first 3 avatars in the avatar group
  const editorsAvatars = editors.slice(0, 3);
  const shouldShow = others.length > 0;
  const editorsCount = editors.length;

  return (
    <AnimatePresence>
      {shouldShow ? (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 15 }}
          transition={{ duration: 0.15 }}
          className="fixed right-8 bottom-8 bg-white rounded p-3 border border-grey-02 shadow-lg w-60"
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
                <ul key="presence-user-list" className="space-y-3 mb-2 overflow-hidden">
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
