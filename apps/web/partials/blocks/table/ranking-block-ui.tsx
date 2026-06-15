'use client';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';

import { SidePanel } from '~/design-system/icons/side-panel';
import { tabGroupTabLinkStyles } from '~/design-system/tab-group';

function RankingRowSidePanelButton({ onClick, hidden = false }: { onClick: () => void; hidden?: boolean }) {
  return (
    <button
      type="button"
      aria-label="Open entity in side panel"
      className={cx(
        'invisible inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-grey-01 p-1.5 text-grey-03 opacity-0 transition duration-200 hover:bg-grey-02 hover:text-text focus:outline-hidden',
        !hidden &&
          'group-focus-within/rankrow:visible group-focus-within/rankrow:opacity-100 group-hover/rankrow:visible group-hover/rankrow:opacity-100'
      )}
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      <SidePanel />
    </button>
  );
}

export function RankingMyRankingDesktopRow({
  entityName,
  onRemove,
  onOpenSidePanel,
  hideActions = false,
  children,
}: {
  entityName: string;
  onRemove?: () => void;
  onOpenSidePanel: () => void;
  hideActions?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="group/rankrow flex w-full items-center gap-2">
      {onRemove ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Remove ${entityName} from my ranking`}
          className="min-w-0 flex-1 cursor-pointer"
          onClick={onRemove}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onRemove();
            }
          }}
        >
          {children}
        </div>
      ) : (
        <div className="min-w-0 flex-1">{children}</div>
      )}
      <RankingRowSidePanelButton onClick={onOpenSidePanel} hidden={hideActions} />
    </div>
  );
}

export function RankingGlobalDesktopRow({
  onOpenSidePanel,
  children,
}: {
  onOpenSidePanel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group/rankrow flex w-full items-center gap-2">
      <div className="min-w-0 flex-1">{children}</div>
      <RankingRowSidePanelButton onClick={onOpenSidePanel} />
    </div>
  );
}

export function RankingTabButton({
  active,
  label,
  onClick,
  layoutId,
  children,
  ariaLabel,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  layoutId: string;
  children?: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(tabGroupTabLinkStyles({ active }), 'h-6 gap-2 !text-smallTitle !font-semibold lg:!font-medium')}
      aria-selected={active}
      aria-label={ariaLabel}
    >
      {children}
      {label}
      {active ? (
        <motion.div
          layoutId={layoutId}
          layout
          initial={false}
          transition={{ duration: 0.2 }}
          className="absolute right-0 bottom-[-8px] left-0 z-100 h-px bg-text"
        />
      ) : null}
    </button>
  );
}

export function RankingSubmitCtaBanner() {
  return (
    <div className="relative overflow-hidden rounded-lg bg-grey-01 pr-6">
      <div className="ml-auto aspect-[118/74] w-[140px] overflow-hidden">
        <img
          src="/images/ranking/submit_cta.png"
          alt=""
          aria-hidden
          className="size-full object-contain object-right"
        />
      </div>
      <div className="absolute inset-y-0 left-0 right-[140px] flex flex-col justify-center px-6 text-grey-04 [&_p]:!text-[16px]">
        <p>Your entries will become the starting global ranking for everyone else.</p>
        <p>Use the &ldquo;Add my ranking&rdquo; button to get started.</p>
      </div>
    </div>
  );
}

export function RankingFirstSubmissionPrompt({ action }: { action: React.ReactNode }) {
  return (
    <div className="flex w-full min-w-0 flex-col">
      <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-x-3 border-b border-grey-02 pb-4">
        <p className="text-mediumTitle font-semibold text-text lg:font-medium">Submit the first ranking</p>
        <span className="inline-flex shrink-0 items-center">{action}</span>
      </div>
      <div className="pt-4">
        <RankingSubmitCtaBanner />
      </div>
    </div>
  );
}

export function RankingSectionHeaderRow({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-x-3">
      <span
        role="heading"
        aria-level={2}
        className="m-0 min-w-0 flex-1 truncate text-[22px] font-bold text-text lg:text-[17px] lg:font-medium"
      >
        {title}
      </span>
      {action ? <span className="inline-flex shrink-0 items-center">{action}</span> : null}
    </div>
  );
}

/** Compose/fullscreen section title — not for ProseMirror embedded blocks. */
export function RankingFullscreenSectionHeaderRow({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-x-3">
      <h2 className={cx('m-0 min-w-0 flex-1 truncate font-bold text-text', 'text-[22px] lg:text-[17px]')}>{title}</h2>
      {action ? <span className="inline-flex shrink-0 items-center">{action}</span> : null}
    </div>
  );
}
