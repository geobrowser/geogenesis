import { useState } from 'react';
import BoringAvatar from 'boring-avatars';
import pluralize from 'pluralize';
import { EntityPresenceContext } from './entity-presence-provider';
import { Text } from '~/modules/design-system/text';
import { SmallButton } from '~/modules/design-system/button';
import { Spacer } from '~/modules/design-system/spacer';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { CloseSmall } from '~/modules/design-system/icons/close-small';
import { AnimatePresence, motion } from 'framer-motion';
import { ResizableContainer } from '~/modules/design-system/resizable-container';

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export function EntityOthersToast() {
  const [open, setOpen] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const others = EntityPresenceContext.useOthers();
  const [me] = EntityPresenceContext.useMyPresence();

  const shouldShow = open && others.length > 0;

  return (
    <AnimatePresence>
      {shouldShow ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="absolute right-8 bottom-8 bg-white rounded p-3 border border-grey-02 shadow-lg w-60"
        >
          <div className="flex items-center justify-between">
            <ul className="flex items-center gap-2">
              {others.map(other => (
                <li key={other.id}>
                  <BoringAvatar size={16} name={other.presence.address} variant="pixel" />
                </li>
              ))}
              <Text variant="metadataMedium">
                {others.length} {pluralize('user', others.length)} {others.length > 1 ? 'are' : 'is'} editing right now
              </Text>
            </ul>
            <button onClick={() => setOpen(false)}>
              <CloseSmall />
            </button>
          </div>

          <Spacer height={8} />

          <ResizableContainer duration={0.15}>
            {isExpanded ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ul key="presence-user-list" className="space-y-3 mb-2 overflow-hidden">
                  {others.map((other, i) => (
                    <li key={other.connectionId} className="flex items-center gap-2">
                      <BoringAvatar size={16} name={other.presence.address} variant="pixel" />
                      <Text variant="metadata" color="grey-04">
                        {shortAddress(other.presence.address ?? '')}
                      </Text>
                    </li>
                  ))}
                  <li className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BoringAvatar size={16} name={me.address} variant="pixel" />
                      <Text variant="metadata" color="grey-04">
                        {shortAddress(me.address ?? '')}
                      </Text>
                    </div>
                    <Text className="rounded bg-grey-02 px-1" color="grey-04" variant="footnoteMedium">
                      You
                    </Text>
                  </li>
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
            {isExpanded ? `Hide ${pluralize('editor', others.length)}` : `View ${pluralize('editor', others.length)}`}
          </SmallButton>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
