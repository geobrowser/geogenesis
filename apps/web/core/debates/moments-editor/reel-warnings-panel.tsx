'use client';

import * as React from 'react';

import cx from 'classnames';

import { SmallButton } from '~/design-system/button';
import { Text } from '~/design-system/text';

import { POSITIVE_TEXT_CLASS } from '../matchmaking/admin-debate-parts';
import { HUB_LIGHT_CALLOUT_CLASS_NAME, HubCalloutTitle } from '../matchmaking/hub-callout';
import type { ReelWarning, ReelWarningFix } from './reel-warnings';

/**
 * The reel's warnings (GEO-3672), each with what to do and, where one makes sense, a one-click fix.
 * Recommendations, not rules: nothing here stops a publish.
 */
export function ReelWarningsPanel({
  warnings,
  readOnly,
  canAddAtPlayhead,
  onFix,
}: {
  warnings: readonly ReelWarning[];
  readOnly: boolean;
  /** Whether a clip can be added at the playhead now: there is one, and the reel has room. */
  canAddAtPlayhead: boolean;
  onFix: (fix: ReelWarningFix) => void;
}) {
  if (warnings.length === 0) {
    return (
      <div role="status" className={cx('rounded-lg bg-successTertiary p-4 font-medium', POSITIVE_TEXT_CLASS)}>
        No warnings: four alternating clips, each within 18 s, under 70 s in all.
      </div>
    );
  }
  return (
    <div role="status" className={cx(HUB_LIGHT_CALLOUT_CLASS_NAME, 'flex flex-col gap-3')}>
      <HubCalloutTitle as="h2" title={`${warnings.length} thing${warnings.length > 1 ? 's' : ''} to check`}>
        <Text as="span" variant="metadata" color="grey-04">
          Recommendations, not rules: you can still publish.
        </Text>
      </HubCalloutTitle>
      <ul className="flex flex-col gap-3">
        {warnings.map(warning => (
          <li
            key={warning.id}
            className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2.5 border-t border-divider pt-3"
          >
            <WarningIcon severity={warning.severity} />
            <div className="min-w-0">
              <Text as="div" variant="metadataMedium">
                {warning.title}
              </Text>
              <Text as="p" variant="metadata" color="grey-04" className="mt-0.5 !text-[14px] !leading-[18px]">
                {warning.recommendation}
              </Text>
            </div>
            {warning.fix ? (
              <SmallButton
                disabled={readOnly || (warning.fix.kind === 'add-at-playhead' && !canAddAtPlayhead)}
                onClick={() => warning.fix && onFix(warning.fix)}
              >
                {warning.fix.label}
              </SmallButton>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WarningIcon({ severity }: { severity: ReelWarning['severity'] }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-label={severity === 'bad' ? 'Strong warning' : 'Warning'}
      className={cx('mt-0.5', severity === 'bad' ? 'text-red-01' : 'text-orange')}
    >
      <circle cx="8" cy="8" r="7.5" stroke="currentColor" />
      <rect x="7.5" y="4" width="1" height="6" rx="0.5" fill="currentColor" />
      <rect x="7.5" y="11.5" width="1" height="1" rx="0.5" fill="currentColor" />
    </svg>
  );
}
