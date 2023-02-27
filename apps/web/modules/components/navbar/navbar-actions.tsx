import * as React from 'react';
import cx from 'classnames';
import { useAccount } from 'wagmi';

import { Dropdown } from '~/modules/design-system/dropdown';
import { Edit } from '~/modules/design-system/icons/edit';
import { Eye } from '~/modules/design-system/icons/eye';
import { Spacer } from '~/modules/design-system/spacer';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { useEditable } from '~/modules/stores/use-editable';
import { ColorName } from '~/modules/design-system/theme/colors';
import { GeoConnectButton } from '~/modules/wallet';
import { textColors } from '~/modules/design-system/theme/colors';

type LabelRowProps = React.ComponentPropsWithoutRef<'div'> & {
  color: ColorName;
};

const LabelRow = ({ color, className = '', ...rest }: LabelRowProps) => (
  <div className={cx(textColors[color], 'flex items-center', className)} {...rest} />
);

type DropdownOptionValue = 'browse-mode' | 'edit-mode' | 'connect-wallet';

type DropdownOption = {
  label: React.ReactNode;
  sublabel?: string;
  value: DropdownOptionValue;
  disabled: boolean;
  onClick: () => void;
};

function getEditSublabel(isEditor: boolean, address?: string) {
  if (address && isEditor) return undefined;
  if (!address) return 'Connect wallet to edit';
  return 'You don’t have edit access';
}

interface Props {
  spaceId: string;
}

export function NavbarActions({ spaceId }: Props) {
  const { isEditor } = useAccessControl(spaceId);
  const { address } = useAccount();
  const { setEditable, editable } = useEditable();

  const options: DropdownOption[] = [
    {
      label: (
        <LabelRow color={!editable ? 'text' : 'grey-04'}>
          <Eye />
          <Spacer width={8} />
          Browse mode
        </LabelRow>
      ),
      value: 'browse-mode',
      disabled: false,
      onClick: () => {
        setEditable(false);
      },
    },
    {
      label: (
        <LabelRow color={editable ? 'text' : 'grey-04'}>
          <Edit />
          <Spacer width={8} />
          Edit mode
        </LabelRow>
      ),
      sublabel: getEditSublabel(isEditor, address),
      value: 'edit-mode',
      disabled: !isEditor,
      onClick: () => {
        if (isEditor) setEditable(true);
      },
    },
    {
      label: <GeoConnectButton />,
      value: 'connect-wallet',
      disabled: false,
      onClick: () => {
        //
      },
    },
  ];

  return <Dropdown trigger={editable ? 'Edit mode' : 'Browse mode'} options={options} />;
}
