'use client';

import * as React from 'react';

import cx from 'classnames';

import { SmallButton } from '~/design-system/button';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Menu } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

export type GovernanceFilterMenuItem = {
  label: string;
  href: string;
  image?: string | null;
  showImage?: boolean;
};

type Props = {
  label: string;
  items: GovernanceFilterMenuItem[];
  showImages?: boolean;
  maxHeightClass?: string;
};

export function GovernanceFilterMenu({ label, items, showImages, maxHeightClass }: Props) {
  const [open, setOpen] = React.useState(false);
  const [pendingLabel, setPendingLabel] = React.useState<string | null>(null);
  const prevLabelRef = React.useRef(label);

  React.useEffect(() => {
    if (prevLabelRef.current !== label) {
      prevLabelRef.current = label;
      setPendingLabel(null);
    }
  }, [label]);

  const displayLabel = pendingLabel ?? label;

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      asChild
      viewportClassName={cx(
        'min-h-0 w-full min-w-0 overflow-y-auto overscroll-contain scroll-smooth bg-white [background-clip:padding-box]',
        maxHeightClass ?? 'max-h-[200px]'
      )}
      trigger={<SmallButton icon={<ChevronDownSmall />}>{label}</SmallButton>}
    >
      <>
        {items.map(item => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => {
              if (item.label !== displayLabel) setPendingLabel(item.label);
              setOpen(false);
            }}
            className="flex w-full cursor-pointer items-center gap-2 bg-white px-3 py-2.5 hover:bg-bg"
          >
            {showImages && item.showImage !== false ? (
              item.image ? (
                <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-md">
                  <ThumbGeoImage value={item.image} alt="" />
                </span>
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-grey-01 text-[10px] font-medium text-grey-04">
                  {(item.label.trim().slice(0, 1).toUpperCase() || '?').replace(/[^A-Z0-9?]/g, '?')}
                </span>
              )
            ) : null}
            <Text variant="button" className="hover:text-text!">
              {item.label}
            </Text>
          </Link>
        ))}
      </>
    </Menu>
  );
}
