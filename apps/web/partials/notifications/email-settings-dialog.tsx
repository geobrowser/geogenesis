'use client';

import * as React from 'react';

import cx from 'classnames';
import { createPortal } from 'react-dom';

import { useFocusTrap } from '~/core/debates/matchmaking/use-focus-trap';
import { useScrollLock } from '~/core/debates/use-scroll-lock';
import {
  EMAIL_GROUPS,
  EMAIL_GROUP_COPY,
  type EmailGroup,
  type EmailGroupSettings,
  INVITES_OFF_WARNING,
  SAVE_FAILED,
} from '~/core/notifications/email-groups';
import { type EmailSettingsEntry, emailSettingsOpened } from '~/core/notifications/email-settings-analytics';
import { useNotificationPreferences, useSaveEmailSwitch } from '~/core/notifications/hooks';

import { DIALOG_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';
import { Text } from '~/design-system/text';
import { Toggle } from '~/design-system/toggle';

/**
 * Email settings (GEO-3392): the all-email switch, then a switch per group, each saved as it changes.
 * Drawn as the debate dialogs are (the open-lobby dialog's card, the debate room's small switch with its
 * state spelled out, dialog pill buttons), and the same centered card on a phone, with full-width rows.
 *
 * While all email is off the groups are dimmed and inert, and keep their own values: turning it back on
 * restores each as it was, because the server stores them apart.
 *
 * A service that does not report groups yet (before GEO-3372) gets only the all-email switch.
 */
export function EmailSettingsDialog({
  onClose,
  entry,
  via = null,
  openerRef,
}: {
  onClose: () => void;
  entry: EmailSettingsEntry;
  via?: string | null;
  /** Focus goes back here on close: the menu item that opened this has unmounted with its menu. */
  openerRef?: React.RefObject<HTMLElement | null>;
}) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  // Focus in on open, Tab kept inside: `aria-modal` says the page behind is unavailable.
  const cardRef = useFocusTrap(true);
  const { registration, preferences } = useNotificationPreferences();
  const { save, status } = useSaveEmailSwitch();

  useScrollLock();

  const openedRef = React.useRef({ entry, via });
  React.useEffect(() => {
    emailSettingsOpened(openedRef.current.entry, openedRef.current.via);
  }, []);

  // After the trap, so its cleanup runs last: the trap restores focus to what had it on open, the menu
  // item that opened this, which has unmounted with its menu.
  React.useEffect(() => {
    const opener = openerRef?.current ?? null;
    return () => opener?.focus();
  }, [openerRef]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const unavailable = registration.isError || preferences.isError;
  const noEmail = registration.isSuccess && !registration.data.email;
  const data = preferences.data;
  const usable = !unavailable && !noEmail && data !== undefined;
  const allOn = data?.email_enabled ?? false;
  const groups: EmailGroupSettings | null = data?.email_groups ?? null;
  const address = data?.email ?? null;

  const statusText = unavailable
    ? 'Unavailable right now.'
    : noEmail
      ? null
      : status === 'failed'
        ? SAVE_FAILED
        : status === 'saved'
          ? 'Saved.'
          : 'Changes save as you go.';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed inset-0 z-1200 flex items-center justify-center bg-text/45 p-5 backdrop-blur-sm"
      onPointerDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={cardRef}
        tabIndex={-1}
        className="grid max-h-full w-[min(560px,100%)] gap-5 overflow-y-auto rounded-lg bg-white p-5 text-text shadow-card focus:outline-none"
      >
        <div className="grid gap-1.5">
          <h2 id={titleId}>
            <Text as="span" variant="smallTitle">
              Email settings
            </Text>
          </h2>
          <p className="text-metadata text-grey-04" id={descriptionId}>
            {noEmail ? (
              'No email on your account.'
            ) : (
              <>
                <span className="md:hidden">Choose what Geo emails you about.</span>
                {address ? (
                  <>
                    <span className="md:hidden"> </span>Sending to {address}.
                  </>
                ) : null}
              </>
            )}
          </p>
        </div>

        <SettingRow
          name="All Geo emails"
          description="Off stops every email, including debate invites."
          shortDescription="Off stops every email."
          checked={usable && allOn}
          disabled={!usable}
          onChange={enabled => save({ group: 'all', enabled })}
        />

        {groups ? (
          <div
            className={cx(
              'grid rounded-lg border border-grey-02 transition-opacity',
              (!usable || !allOn) && 'opacity-45'
            )}
          >
            {EMAIL_GROUPS.map((group, index) => (
              <GroupRow
                key={group}
                group={group}
                first={index === 0}
                checked={usable && allOn && groups[group]}
                disabled={!usable || !allOn}
                warn={usable && allOn && group === 'invites' && !groups.invites}
                onChange={enabled => save({ group, enabled })}
              />
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4 md:flex-col md:items-stretch">
          <p
            className={cx('text-footnote', status === 'failed' && usable ? 'text-red-01' : 'text-grey-04')}
            role="status"
            aria-live="polite"
          >
            {statusText ? `${statusText} ` : null}Space proposals are set in each space&apos;s settings.
          </p>
          <button
            type="button"
            onClick={onClose}
            className={cx(DIALOG_ACTION_BUTTON_CLASS_NAME, '!w-auto shrink-0 md:!w-full')}
          >
            Done
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function GroupRow({
  group,
  first,
  checked,
  disabled,
  warn,
  onChange,
}: {
  group: EmailGroup;
  first: boolean;
  checked: boolean;
  disabled: boolean;
  warn: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const copy = EMAIL_GROUP_COPY[group];
  return (
    <div className={cx('p-3', !first && 'border-t border-[#f0f0f0]')}>
      <SettingRow
        name={copy.name}
        description={copy.description}
        shortDescription={copy.shortDescription}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        minHeightClassName="md:min-h-10"
      />
      {warn ? (
        <Text as="p" variant="metadata" className="mt-2.5">
          {INVITES_OFF_WARNING}
        </Text>
      ) : null}
    </div>
  );
}

/**
 * One switch, the whole row its target (44px or more on a phone): its name, a line on what it covers
 * (a shorter one on a phone), and the state spelled out beside the switch.
 */
function SettingRow({
  name,
  description,
  shortDescription,
  checked,
  disabled,
  onChange,
  minHeightClassName = 'md:min-h-11',
}: {
  name: string;
  description: string;
  shortDescription: string;
  checked: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
  /** A group row's padding already makes it a 64px target, as the mockup's are; the all-email row is 44px. */
  minHeightClassName?: string;
}) {
  const descriptionId = React.useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={name}
      aria-describedby={descriptionId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'flex w-full items-center justify-between gap-4 text-left disabled:cursor-default md:gap-3',
        minHeightClassName
      )}
    >
      <span className="grid min-w-0 gap-1 md:gap-0.5">
        <Text as="span" variant="metadataMedium">
          {name}
        </Text>
        <span className="text-metadata text-grey-04" id={descriptionId}>
          <span className="md:hidden">{description}</span>
          <span className="hidden md:inline">{shortDescription}</span>
        </span>
      </span>
      <span className="flex min-h-7 shrink-0 items-center gap-1.5 text-metadata text-grey-04">
        <span>{checked ? 'On' : 'Off'}</span>
        <Toggle checked={checked} aria-hidden />
      </span>
    </button>
  );
}
