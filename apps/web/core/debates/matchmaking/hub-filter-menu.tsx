'use client';

import * as React from 'react';

import { SmallButton } from '~/design-system/button';
import { CheckboxVisual } from '~/design-system/checkbox';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { TickSmall } from '~/design-system/icons/tick-small';
import { Menu } from '~/design-system/menu';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { formatFacetCount } from './topic-facets';

export type HubFilterOption<T extends string> = {
  value: T;
  label: string;
  image?: string | null;
  showImage?: boolean;
  /** This option's label hasn't arrived yet — draw it as a skeleton and don't let it be picked. */
  pending?: boolean;
  /** How many claims this option would leave, given every other filter currently applied. */
  count?: number;
};

type Props<T extends string> = {
  label: string;
  options: HubFilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  showImages?: boolean;
  /** As {@link HubFilterOption.pending}, for the name in the trigger pill. */
  labelPending?: boolean;
};

/**
 * State-driven sibling of `GovernanceFilterMenu` — the hub filters live in local state instead of
 * the URL, so options are buttons rather than links.
 *
 * An option whose name is still loading draws as a skeleton rather than a placeholder word. A
 * column of identical "Space" rows reads as a list of real, indistinguishable choices — it invites
 * a pick that means nothing, where a skeleton says plainly that the name is on its way.
 */
export function HubFilterMenu<T extends string>({
  label,
  options,
  value,
  onChange,
  showImages,
  labelPending,
}: Props<T>) {
  const [open, setOpen] = React.useState(false);

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      asChild
      className="max-w-[280px]"
      // Space names come from the knowledge graph and can be long enough to burst the pill.
      trigger={
        <SmallButton icon={<ChevronDownSmall />} className="max-w-[160px]">
          {labelPending ? (
            // Sized to the pill's line box so the trigger doesn't resize when the name lands.
            <Skeleton className="h-[1em] w-16" aria-label="Loading space name" />
          ) : (
            <span className="truncate">{label}</span>
          )}
        </SmallButton>
      }
    >
      <>
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            // Picking a space nobody can name yet filters the list to something the viewer can't
            // read back off the trigger. The wait is short; the dead end isn't worth it.
            disabled={option.pending}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            className="flex w-full cursor-pointer items-center gap-2 bg-white px-3 py-2.5 text-left hover:bg-bg disabled:cursor-default disabled:hover:bg-white"
          >
            {showImages && option.showImage !== false ? (
              option.pending ? (
                <Skeleton className="h-5 w-5 shrink-0 rounded-md" />
              ) : option.image ? (
                <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-md">
                  <ThumbGeoImage value={option.image} alt="" />
                </span>
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-grey-01 text-[10px] font-medium text-grey-04">
                  {(option.label.trim().slice(0, 1).toUpperCase() || '?').replace(/[^A-Z0-9?]/g, '?')}
                </span>
              )
            ) : null}
            {option.pending ? (
              // Varied widths so a run of them reads as a list of names rather than a striped block.
              <Skeleton
                className="h-[1em] flex-1"
                style={{ maxWidth: pendingLabelWidth(option.value) }}
                aria-label="Loading space name"
              />
            ) : (
              <Text variant="button" className="truncate hover:text-text!">
                {option.label}
              </Text>
            )}
            {option.value === value ? (
              <span className="ml-auto shrink-0">
                <TickSmall />
              </span>
            ) : null}
          </button>
        ))}
      </>
    </Menu>
  );
}

type MultiProps<T extends string> = {
  /** Shown in the trigger pill: the one selected name, a count of them, or the "any" wording. */
  label: string;
  options: HubFilterOption<T>[];
  values: T[];
  onToggle: (value: T) => void;
  /** Clears every selection — the row that reads "Any space" / "Any topic". */
  onClear: () => void;
  clearLabel: string;
  showImages?: boolean;
  labelPending?: boolean;
};

/**
 * The multi-select twin of {@link HubFilterMenu}: checkboxes, and the menu stays open so several
 * can be picked in one visit.
 *
 * Counts sit at the end of each row and describe what that option would leave given every *other*
 * filter — geo-chat counts each dimension without narrowing itself, so a topic's count answers
 * "how many of the claims I'm already looking at carry this", and ticking one never changes the
 * numbers in its own menu.
 */
export function HubMultiFilterMenu<T extends string>({
  label,
  options,
  values,
  onToggle,
  onClear,
  clearLabel,
  showImages,
  labelPending,
}: MultiProps<T>) {
  const [open, setOpen] = React.useState(false);
  const selected = new Set<string>(values);

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      asChild
      className="max-w-[280px]"
      trigger={
        <SmallButton icon={<ChevronDownSmall />} className="max-w-[160px]">
          {labelPending ? (
            <Skeleton className="h-[1em] w-16" aria-label="Loading space name" />
          ) : (
            <span className="truncate">{label}</span>
          )}
        </SmallButton>
      }
    >
      <>
        <button
          type="button"
          onClick={() => {
            onClear();
            setOpen(false);
          }}
          className="flex w-full cursor-pointer items-center gap-2 bg-white px-3 py-2.5 text-left hover:bg-bg"
        >
          <Text variant="button" className="truncate hover:text-text!">
            {clearLabel}
          </Text>
          {values.length === 0 ? (
            <span className="ml-auto shrink-0">
              <TickSmall />
            </span>
          ) : null}
        </button>
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            disabled={option.pending}
            // No `setOpen(false)`: the point of multi-select is picking more than one, and closing
            // on the first tick would make the second a whole new trip through the trigger.
            onClick={() => onToggle(option.value)}
            className="flex w-full cursor-pointer items-center gap-2 bg-white px-3 py-2.5 text-left hover:bg-bg disabled:cursor-default disabled:hover:bg-white"
          >
            <span className="shrink-0">
              <CheckboxVisual checked={selected.has(option.value)} />
            </span>
            {showImages && option.showImage !== false ? (
              option.pending ? (
                <Skeleton className="h-5 w-5 shrink-0 rounded-md" />
              ) : option.image ? (
                <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-md">
                  <ThumbGeoImage value={option.image} alt="" />
                </span>
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-grey-01 text-[10px] font-medium text-grey-04">
                  {(option.label.trim().slice(0, 1).toUpperCase() || '?').replace(/[^A-Z0-9?]/g, '?')}
                </span>
              )
            ) : null}
            {option.pending ? (
              <Skeleton
                className="h-[1em] flex-1"
                style={{ maxWidth: pendingLabelWidth(option.value) }}
                aria-label="Loading space name"
              />
            ) : (
              <Text variant="button" className="truncate hover:text-text!">
                {option.label}
              </Text>
            )}
            {option.count === undefined ? null : (
              <Text variant="footnote" className="ml-auto shrink-0 text-grey-04!">
                {formatFacetCount(option.count)}
              </Text>
            )}
          </button>
        ))}
      </>
    </Menu>
  );
}

/**
 * A stable pseudo-random width per option, so the skeletons look like names of different lengths
 * and stay put across re-renders rather than jittering while the fetch runs.
 */
function pendingLabelWidth(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return `${60 + (hash % 5) * 15}px`;
}
