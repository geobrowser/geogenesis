import * as React from 'react';
import { cva } from 'class-variance-authority';

import { ColorName } from './theme/colors';
import { TypographyName } from './theme/typography';

interface Props {
  children: React.ReactNode;
  color?: ColorName;
  variant?: TypographyName;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div' | 'a' | 'li';
  ellipsize?: boolean;
  className?: string;
}

const textStyles = cva('', {
  variants: {
    variant: {
      mainPage: 'text-mainPage',
      largeTitle: 'text-largeTitle',
      mediumTitle: 'text-mediumTitle',
      cardEntityTitle: 'text-cardEntityTitle',
      smallTitle: 'text-smallTitle',
      body: 'text-body',
      tableCell: 'text-tableCell',
      textLink: 'text-textLink',
      quote: 'text-quote',
      listItem: 'text-listItem',
      button: 'text-button',
      smallButton: 'text-smallButton',
      tag: 'text-tag',
      input: 'text-input',
      metadata: 'text-metadata',
      breadcrumb: 'text-breadcrumb',
      navlink: 'text-navLink',
      footnote: 'text-footnote',
      bodySemibold: 'text-bodySemibold',
      textLinkSemibold: 'text-textLinkSemibold',
      listSemibold: 'text-listSemibold',
      quoteMedium: 'text-quoteMedium',
      inputMedium: 'text-inputMedium',
      metadataMedium: 'text-metadataMedium',
      footnoteMedium: 'text-footnoteMedium',
    },
    color: {
      white: 'text-white',
      text: 'text-text',
      ctaPrimary: 'text-ctaPrimary',
      ctaHover: 'text-ctaHover',
      ctaTertiary: 'text-ctaTertiary',
      purple: 'text-purple',
      pink: 'text-pink',
      bg: 'text-bg',
      'grey-01': 'text-grey-01',
      'grey-02': 'text-grey-02',
      'grey-03': 'text-grey-03',
      'grey-04': 'text-grey-04',
      divider: 'text-divider',
      orange: 'text-orange',
      green: 'text-green',
      'red-01': 'text-red-01',
      'red-02': 'text-red-02',
    },
    ellipsize: {
      true: 'whitespace-pre text-overflow-ellipsis overflow-hidden',
    },
  },
  defaultVariants: {
    variant: 'body',
    color: 'text',
  },
});

export const Text = ({
  children,
  color = 'text',
  variant = 'body',
  as = 'span',
  ellipsize = false,
  className = '',
  ...rest
}: Props) => {
  const Tag = as;
  return (
    <Tag className={textStyles({ variant, color, ellipsize, className })} {...rest}>
      {children}
    </Tag>
  );
};
