import cx from 'classnames';

import * as React from 'react';
import { ForwardedRef, forwardRef } from 'react';

import { Entity } from './icons/entity';
import { Facts } from './icons/facts';
import { OrganizeData } from './icons/organize-data';
import { Target } from './icons/target';
import { Spacer } from './spacer';
import { ColorName } from './theme/colors';

type Icon = 'entity' | 'organize-data' | 'facts' | 'target';

const icons: Record<Icon, React.FunctionComponent<{ color?: ColorName }>> = {
  'organize-data': OrganizeData,
  entity: Entity,
  facts: Facts,
  target: Target,
};

interface Props {
  isActive: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  icon: Icon;
  disabled?: boolean;
}

export const TabButton = forwardRef(function OnboardingButton(
  { isActive, onClick, children, icon, disabled = false }: Props,
  ref: ForwardedRef<HTMLButtonElement>
) {
  const IconComponent = icons[icon];

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={cx(
        isActive
          ? 'bg-text text-white hover:bg-text [&>svg]:text-white'
          : 'text-text hover:bg-white [&>svg]:text-grey-04',
        'shadow-inset-text relative flex cursor-pointer items-center justify-center rounded border px-3 py-2 text-button outline-none transition-all duration-150 ease-in-out [&>svg]:transition-all [&>svg]:duration-200 [&>svg]:ease-in-out'
      )}
      disabled={disabled}
    >
      <IconComponent />
      <Spacer width={8} />
      {children}
    </button>
  );
});
