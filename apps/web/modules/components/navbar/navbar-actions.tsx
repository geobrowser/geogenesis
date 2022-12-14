import styled from '@emotion/styled';
import { useAccountModal, useConnectModal } from '@rainbow-me/rainbowkit';
import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Dropdown } from '~/modules/design-system/dropdown';
import { Edit } from '~/modules/design-system/icons/edit';
import { Eye } from '~/modules/design-system/icons/eye';
import { Link } from '~/modules/design-system/icons/link';
import { Unlink } from '~/modules/design-system/icons/unlink';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { useAccessControl } from '~/modules/state/use-access-control';
import { useEditable } from '~/modules/state/use-editable';
import { ColorName } from '~/modules/design-system/theme/colors';

interface Props {
  spaceId: string;
}

type ColorOption = ColorName;

const LabelRow = styled.div<{ color: ColorOption }>(props => ({
  color: props.theme.colors[props.color],
  display: 'flex',
  alignItems: 'center',
}));

type DropdownOptionValue = 'browse-mode' | 'edit-mode' | 'connect-wallet';
type DropdownOption = {
  label: React.ReactNode;
  sublabel?: string;
  value: DropdownOptionValue;
  disabled: boolean;
  onClick: () => void;
};

export function NavbarActions({ spaceId }: Props) {
  const { address } = useAccount();
  const { isEditor } = useAccessControl(spaceId);
  const { setEditable, editable } = useEditable();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const [value, setValue] = useState<DropdownOptionValue>('browse-mode');

  const options: DropdownOption[] = [
    {
      label: (
        <LabelRow color={value === 'browse-mode' ? 'text' : 'grey-04'}>
          <Eye />
          <Spacer width={8} />
          Browse mode
        </LabelRow>
      ),
      value: 'browse-mode',
      disabled: false,
      onClick: () => {
        setEditable(false);
        setValue('browse-mode');
      },
    },
    {
      label: (
        <LabelRow color={value === 'edit-mode' ? 'text' : 'grey-04'}>
          <Edit />
          <Spacer width={8} />
          Edit mode
        </LabelRow>
      ),
      sublabel: 'Connect wallet to edit',
      value: 'edit-mode',
      disabled: !isEditor,
      onClick: () => {
        if (isEditor) setEditable(true);
        setValue('edit-mode');
      },
    },
    {
      label: (
        <LabelRow color="ctaPrimary">
          {address ? <Unlink /> : <Link />}
          <Spacer width={8} />
          <Text color="ctaPrimary" variant="button">
            {address ? 'Disconnect wallet' : 'Connect wallet'}
          </Text>
        </LabelRow>
      ),
      value: 'connect-wallet',
      disabled: false,
      onClick: () => {
        address ? openAccountModal?.() : openConnectModal?.();
        setValue(address ? 'browse-mode' : 'edit-mode');
      },
    },
  ];

  return <Dropdown trigger={editable ? 'Edit mode' : 'Browse mode'} options={options} />;
}
