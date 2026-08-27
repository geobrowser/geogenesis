'use client';

import * as RadioGroup from '@radix-ui/react-radio-group';

import cx from 'classnames';

import type { MediaDeviceOption } from '~/core/debates/media-session';

import { Check } from '~/design-system/icons/check';
import { Text } from '~/design-system/text';

/**
 * The device chooser shared by every surface that puts a microphone in the user's hands — the
 * debate pre-join screen and the claim-exploration voice pill. They have to look and behave the
 * same, because the choice made in one carries into the other.
 */
export function DeviceOptionGroup({
  label,
  options,
  selectedDeviceId,
  disabled = false,
  /** Draws a border around the list. The bottom sheet has no popover chrome to sit inside. */
  framed = false,
  onChange,
}: {
  label: string;
  options: MediaDeviceOption[];
  selectedDeviceId: string;
  disabled?: boolean;
  framed?: boolean;
  onChange: (deviceId: string) => void;
}) {
  return (
    <RadioGroup.Root aria-label={label} value={selectedDeviceId} disabled={disabled} onValueChange={onChange}>
      <Text as="p" variant="metadata" color="grey-04" className="px-1 pb-1">
        {label}
      </Text>
      <div className={cx(framed ? 'space-y-1 rounded-lg border border-grey-02 p-1' : 'space-y-0.5')}>
        {options.map(device => {
          const selected = device.deviceId === selectedDeviceId;
          return (
            <RadioGroup.Item
              key={`${device.kind}:${device.deviceId}`}
              value={device.deviceId}
              className={cx(
                'flex w-full items-center justify-between gap-3 rounded-md text-left text-metadata text-text outline-none',
                // The bottom sheet has the room for the taller rows the designs draw; the pre-join
                // popover does not, and its metrics predate this component being shared.
                framed ? 'px-4 py-3' : 'min-h-9 px-3 py-2',
                selected ? 'bg-grey-01' : 'hover:bg-grey-01',
                'focus-visible:ring-1 focus-visible:ring-text disabled:cursor-default disabled:opacity-100'
              )}
            >
              <span className="min-w-0 truncate">{device.label}</span>
              {selected && (
                <span aria-hidden="true" className="shrink-0">
                  <Check />
                </span>
              )}
            </RadioGroup.Item>
          );
        })}
      </div>
    </RadioGroup.Root>
  );
}
