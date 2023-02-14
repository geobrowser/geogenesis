import styled from '@emotion/styled';
import { Command } from 'cmdk';
import { useAccount } from 'wagmi';
import { Entity } from '~/modules/types';
import { SquareButton } from '../design-system/button';
import { formatAddress } from '../utils';

interface Props {
  onDone: (result: Entity) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DialogContainer = styled(Command.Dialog)(props => ({
  position: 'fixed',
  display: 'flex',
  flexDirection: 'column',
  top: '25%',
  left: '50%',
  transform: 'translateX(-50%)',
  width: '100%',
  maxWidth: 434,
  padding: props.theme.space * 4,
  backgroundColor: props.theme.colors.white,
  borderRadius: props.theme.radius,
  overflow: 'hidden',
  border: `1px solid ${props.theme.colors['grey-02']}`,
  boxShadow: props.theme.shadows.dropdown,
}));

export function OnboardingDialog({ onDone, open, onOpenChange }: Props) {
  const { address } = useAccount();

  if (!address) return null;

  return (
    <DialogContainer open={open} onOpenChange={onOpenChange} label="Entity search">
      <div className="flex justify-between items-center pb-12">
        <SquareButton icon="trash" onClick={() => console.log('freedom')} />
        <div className="text-metadataMedium">Profile Creation</div>
        <SquareButton icon="rightArrowLongSmall" onClick={() => console.log('freedom')} />
      </div>
      <div className="flex justify-center pb-8">
        <div className="bg-divider rounded px-2 py-1 inline-block text-mediumTitle">{formatAddress(address)}</div>
      </div>
      <div>
        <div className="text-bodySemibold text-xl text-center">
          It looks like you don’t have a<br /> Geo profile on this wallet address.
        </div>
      </div>
    </DialogContainer>
  );
}
