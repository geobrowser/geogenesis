'use client';

import * as AccordionPrimitive from '@radix-ui/react-accordion';
import cx from 'classnames';

import * as React from 'react';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

type AccordionProps = AccordionPrimitive.AccordionSingleProps;

export const Accordion = ({ children, ...rest }: AccordionProps) => {
  return <AccordionPrimitive.Root {...rest}>{children}</AccordionPrimitive.Root>;
};

type AccordionItemProps = React.ComponentPropsWithoutRef<'div'> & {
  value: string;
  disabled?: boolean;
};

const AccordionItem = ({ value, disabled = false, className, ...rest }: AccordionItemProps) => (
  <AccordionPrimitive.Item
    value={value}
    disabled={disabled}
    className={cx('border-b border-grey-01 last:border-none', className)}
    {...rest}
  />
);

type AccordionTriggerProps = React.ComponentPropsWithoutRef<'button'>;

const AccordionTrigger = ({ className, children, ...rest }: AccordionTriggerProps) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      className={cx(
        'group flex flex-1 items-center justify-between py-6 transition duration-300 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-25',
        className
      )}
      {...rest}
    >
      <div>{children}</div>
      <div className="transition duration-300 group-data-[state=open]:rotate-180 group-data-[disabled]:grayscale">
        <ChevronDownSmall color="ctaPrimary" />
      </div>
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
);

type AccordionContentProps = React.ComponentPropsWithoutRef<'div'>;

const AccordionContent = ({ className, children, ...rest }: AccordionContentProps) => (
  <AccordionPrimitive.Content
    className={cx(
      'overflow-y-hidden data-[state=closed]:animate-slide-up data-[state=open]:animate-slide-down',
      className
    )}
    {...rest}
  >
    <div className="pb-6">{children}</div>
  </AccordionPrimitive.Content>
);

Accordion.Item = AccordionItem;
Accordion.Trigger = AccordionTrigger;
Accordion.Content = AccordionContent;
