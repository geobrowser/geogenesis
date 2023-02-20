import { useState } from 'react';
import { useAccount } from 'wagmi';
import BoringAvatar from 'boring-avatars';
import pluralize from 'pluralize';
import { EntityPresenceContext } from './entity-presence-provider';
import { Text } from '~/modules/design-system/text';
import { SmallButton } from '~/modules/design-system/button';
import { Spacer } from '~/modules/design-system/spacer';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { CloseSmall } from '~/modules/design-system/icons/close-small';

export function EntityOthersToast() {
  const account = useAccount();
  const [open, setOpen] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const others = EntityPresenceContext.useOthers();
  const [me, setMe] = EntityPresenceContext.useMyPresence();

  return open ? (
    <div className="absolute right-8 bottom-8 bg-white rounded p-3 shadow-inner shadow-grey-02 drop-shadow-lg w-60">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BoringAvatar size={16} name={account.address} variant="pixel" />
          <Text variant="metadataMedium">1 user is editing right now</Text>
        </div>
        <button onClick={() => setOpen(false)}>
          <CloseSmall />
        </button>
      </div>

      <Spacer height={8} />

      {isExpanded && (
        <ul className="space-y-3">
          {others.map(other => (
            <li key={other.connectionId} className="flex items-center gap-2">
              <BoringAvatar />
              <Text variant="metadata" color="grey-04">
                {other.presence.address}
              </Text>
            </li>
          ))}
        </ul>
      )}

      <SmallButton variant="secondary" onClick={() => setIsExpanded(!isExpanded)}>
        <span style={{ rotate: isExpanded ? '180deg' : '0deg' }}>
          <ChevronDownSmall color="grey-04" />
        </span>
        <Spacer width={6} />
        {isExpanded ? `Hide ${pluralize('editor', others.length)}` : `View ${pluralize('editor', others.length)}`}
      </SmallButton>
    </div>
  ) : null;
}
