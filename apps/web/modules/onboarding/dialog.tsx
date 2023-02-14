import styled from '@emotion/styled';
import { Command } from 'cmdk';
import { ConnectKitButton, useModal } from 'connectkit';
import { useAccount, useDisconnect } from 'wagmi';
import { Entity } from '~/modules/types';
import { Button, SquareButton } from '../design-system/button';
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
  maxWidth: 360,
  padding: props.theme.space * 4,
  backgroundColor: props.theme.colors.white,
  borderRadius: props.theme.radius,
  overflow: 'hidden',
  border: `1px solid ${props.theme.colors['grey-02']}`,
  boxShadow: props.theme.shadows.dropdown,
}));

export function OnboardingDialog({ onDone, open, onOpenChange }: Props) {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { setOpen } = useModal();

  if (!address) return null;

  return (
    <DialogContainer open={open} onOpenChange={onOpenChange} label="Entity search">
      <div className="flex justify-between items-center pb-12">
        <div className="rotate-180">
          <SquareButton icon="rightArrowLongSmall" onClick={() => console.log('freedom')} />
        </div>
        <div className="text-metadataMedium">Profile Creation</div>
        <SquareButton icon="close" onClick={() => console.log('freedom')} />
      </div>
      <div className="flex justify-center pb-8">
        <div className="bg-divider rounded px-2 py-1 inline-block text-mediumTitle">{formatAddress(address)}</div>
      </div>
      <div className="pb-3">
        <div className="text-bodySemibold text-xl text-center">
          It looks like you don’t have a<br /> Geo profile on this wallet address.
        </div>
      </div>
      <div className="flex justify-center pb-24">
        <ConnectKitButton.Custom>
          {({ show, hide }) => {
            return (
              <div
                onClick={() => {
                  hide && hide();
                  disconnect();
                  show && show();
                }}
                className="text-ctaPrimary text-metadataMedium text-center cursor-pointer hover:underline inline-block"
              >
                Change wallet
              </div>
            );
          }}
        </ConnectKitButton.Custom>
      </div>
      <div className="flex justify-center pb-8">
        <Button>Create Profile</Button>
      </div>
    </DialogContainer>
  );
}
