'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import {
  type UnsubscribeLinkParams,
  type UnsubscribeState,
  changeSubscription,
  geoNotificationsApiUrl,
  getUnsubscribeState,
} from '~/core/notifications/api';
import {
  INVALID_UNSUBSCRIBE_LINK,
  SAVE_FAILED,
  UNDO_EXPIRED_BODY,
  UNSUBSCRIBE_COPY,
  withAddress,
} from '~/core/notifications/email-groups';
import { emailPreferenceChanged } from '~/core/notifications/email-settings-analytics';
import { toEmailSettings } from '~/core/notifications/email-settings-link';

import { DIALOG_ACTION_BUTTON_CLASS_NAME, DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';
import { Text } from '~/design-system/text';

const EMAIL_SETTINGS_HREF = toEmailSettings();

/**
 * Where an email's Unsubscribe link lands once geo-notifications points `UNSUBSCRIBE_PAGE_URL` here
 * (GEO-3392). Works signed out: the link's token is signed for one person and one group (GEO-3372),
 * and the page passes it, with the `kind` and `send` it arrived with, back to the service.
 *
 * It asks first, because mail scanners open every link in an email: opening the page only reads the
 * link, and nothing changes until the person presses Unsubscribe. Then it confirms, says what keeps
 * coming, and offers Undo for a day. The mail app's own one-click button never comes here.
 *
 * Which step to show is the service's answer (`state`), so this page and the service's own confirm
 * page can't disagree.
 */
export function UnsubscribePage() {
  const searchParams = useSearchParams();
  const baseUrl = geoNotificationsApiUrl();
  const token = searchParams?.get('token') || null;
  const link: UnsubscribeLinkParams | null = token
    ? { token, kind: searchParams?.get('kind') || null, send: searchParams?.get('send') || null }
    : null;

  const read = useQuery({
    queryKey: ['notifications', 'unsubscribe', link],
    queryFn: () => getUnsubscribeState(baseUrl!, link!),
    enabled: baseUrl !== null && link !== null,
    // A link the service refuses (4xx) stays refused; only a dropped request is worth one more try.
    retry: (failures, error) => failures < 1 && !isClientError(error),
    refetchOnWindowFocus: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const [answer, setAnswer] = React.useState<UnsubscribeState | null>(null);
  const change = useMutation({
    mutationFn: (action: 'unsubscribe' | 'undo') => changeSubscription(baseUrl!, link!, action),
    onSuccess: (saved, action) => {
      setAnswer(saved);
      if (saved.state === 'done' || saved.state === 'undone') {
        emailPreferenceChanged({
          group: saved.group,
          enabled: action === 'undo',
          surface: 'unsubscribe_page',
          undo: action === 'undo',
        });
      }
    },
  });

  if (baseUrl === null || link === null || read.isError) {
    return (
      <Card>
        <Heading title={INVALID_UNSUBSCRIBE_LINK.title} body={INVALID_UNSUBSCRIBE_LINK.body} />
        <Link href={EMAIL_SETTINGS_HREF} className={DIALOG_ACTION_BUTTON_CLASS_NAME}>
          Email settings
        </Link>
      </Card>
    );
  }

  const current = answer ?? read.data ?? null;
  if (!current) return <Card aria-busy />;

  const copy = UNSUBSCRIBE_COPY[current.group];
  const fill = (text: string) => withAddress(text, current.email);
  const failed = change.isError ? (
    <p className="text-footnote text-red-01" role="status">
      {SAVE_FAILED}
    </p>
  ) : null;

  switch (current.state) {
    case 'ask':
      return (
        <Card>
          <Heading title={copy.askTitle} body={fill(copy.askBody)} />
          <div className="grid grid-cols-2 gap-2">
            <Link href={EMAIL_SETTINGS_HREF} className={DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME}>
              Email settings
            </Link>
            <button
              type="button"
              disabled={change.isPending}
              onClick={() => change.mutate('unsubscribe')}
              className={DIALOG_ACTION_BUTTON_CLASS_NAME}
            >
              Unsubscribe
            </button>
          </div>
          {failed}
        </Card>
      );
    case 'done':
      return (
        <Card>
          <Heading title={copy.doneTitle} body={fill(copy.doneBody)} />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={change.isPending}
              onClick={() => change.mutate('undo')}
              className={DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME}
            >
              Undo
            </button>
            <Link href={EMAIL_SETTINGS_HREF} className={DIALOG_ACTION_BUTTON_CLASS_NAME}>
              Email settings
            </Link>
          </div>
          {failed}
        </Card>
      );
    // Opened a link for a group already off (pressed before, or switched off in settings): no Undo,
    // so a link in an old forwarded email can't switch someone back on.
    case 'already_off':
    case 'undo_expired':
      return (
        <Card>
          <Heading
            title={copy.doneTitle}
            body={current.state === 'undo_expired' ? UNDO_EXPIRED_BODY : fill(copy.doneBody)}
          />
          <Link href={EMAIL_SETTINGS_HREF} className={DIALOG_ACTION_BUTTON_CLASS_NAME}>
            Email settings
          </Link>
        </Card>
      );
    case 'undone':
      return (
        <Card>
          <Heading title={copy.undoneTitle} body={copy.undoneBody} />
          <Link href={EMAIL_SETTINGS_HREF} className={DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME}>
            Email settings
          </Link>
        </Card>
      );
  }
}

function isClientError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

function Card({ children, ...rest }: { children?: React.ReactNode } & React.ComponentPropsWithoutRef<'section'>) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-5">
      <section
        {...rest}
        className={cx(
          'grid w-[min(480px,100%)] gap-5 rounded-lg bg-white p-5 text-text shadow-card',
          !children && 'min-h-32'
        )}
      >
        {children}
      </section>
    </div>
  );
}

function Heading({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid gap-1.5">
      <h1>
        <Text as="span" variant="smallTitle">
          {title}
        </Text>
      </h1>
      <Text as="p" variant="metadata" color="grey-04">
        {body}
      </Text>
    </div>
  );
}
