import styled from '@emotion/styled';
import { observer } from '@legendapp/state/react';
import { Command } from 'cmdk';
import { useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { GeoLogoLarge } from '~/modules/design-system/icons/geo-logo-large';
import { Entity } from '~/modules/types';
import { Avatar } from '../avatar';
import { Button, SquareButton } from '../design-system/button';
import { formatAddress } from '../utils';
import { useOnboarding } from './use-onboarding';
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
  height: 398,
  padding: props.theme.space * 4,
  backgroundColor: props.theme.colors.white,
  borderRadius: props.theme.radius,
  overflow: 'hidden',
  border: `1px solid ${props.theme.colors['grey-02']}`,
  boxShadow: props.theme.shadows.dropdown,
}));

export function StepWallet({ nextStep }: { nextStep: () => void }) {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();

  return (
    <div>
      <div className="flex justify-center pb-8">
        <div className="bg-divider rounded px-2 py-1 inline-block text-mediumTitle">{formatAddress(address)}</div>
      </div>
      <div className="pb-3">
        <div className="text-bodySemibold text-xl text-center">
          It looks like you don’t have a<br /> Geo profile on this wallet address.
        </div>
      </div>
      <div className="flex justify-center">
        <div
          onClick={() => disconnect()}
          className="text-ctaPrimary text-metadataMedium text-center cursor-pointer hover:underline inline-block"
        >
          Change wallet
        </div>
      </div>
      <div className="flex justify-center absolute bottom-6 inset-x-0">
        <Button onClick={nextStep}>Create Profile</Button>
      </div>
    </div>
  );
}

export function StepName({
  nextStep,
  name,
  setName,
}: {
  nextStep: () => void;
  name: string;
  setName: (name: string) => void;
}) {
  const validName = name.length > 3;

  return (
    <div>
      <div className="flex justify-center">
        <div className="pb-8 inline-block text-mediumTitle">
          <input
            placeholder="Name..."
            className="text-center block px-2 py-1"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
        </div>
      </div>
      <div className="text-bodySemibold text-xl text-center">
        You can use your real name or a pseudonym if you’d prefer to remain anonymous.
      </div>

      <div className="flex justify-center absolute bottom-6 inset-x-0">
        <Button disabled={!validName} onClick={nextStep}>
          Continue
        </Button>
      </div>
    </div>
  );
}

export function StepAvatar({ nextStep, name, address }: { nextStep: () => void; name: string; address: string }) {
  return (
    <div>
      <div className="text-center pb-4 text-smallTitle -mt-6">{name}</div>
      <div className="pb-4 flex justify-center">
        <Avatar size={154} value={address} />
      </div>

      <div className="flex justify-center">
        <div className="text-ctaPrimary text-metadataMedium text-center cursor-pointer hover:underline inline-block">
          Upload photo
        </div>
      </div>
      <div className="flex justify-center absolute bottom-6 inset-x-0">
        <Button onClick={nextStep}>Create Profile</Button>
      </div>
    </div>
  );
}

export function StepSuccess() {
  return (
    <div className="bg-pink relative h-full pt-20">
      <div className="bg-white text-center shadow-lg w-24 h-24 mx-auto">
        <div className="justify-center flex w-full pb-3">
          <GeoLogoLarge width={67} height={67} />
        </div>
        <div className="text-input">Welcome to</div>
        <div className="text-largeTitle">GEO</div>
      </div>

      <div className="flex justify-center absolute bottom-6 inset-x-0">
        <Button>View Profile</Button>
      </div>
    </div>
  );
}

export const OnboardingDialog = observer(() => {
  const { isOnboardingVisible, hideOnboarding } = useOnboarding();

  const { address } = useAccount();
  const { disconnect } = useDisconnect();

  const [name, setName] = useState('');
  const [step, setStep] = useState(0);

  const nextStep = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  if (!address) return null;

  const steps = [
    <StepWallet nextStep={nextStep} key="wallet" />,
    <StepName nextStep={nextStep} setName={setName} name={name} key="name" />,
    <StepAvatar nextStep={nextStep} name={name} address={address} key="avatar" />,
    <StepSuccess key="success" />,
  ];

  const showBackButton = step > 0 && step < steps.length - 1;
  const showTitle = step !== steps.length - 1;

  return (
    <DialogContainer open={isOnboardingVisible.get()} label="Entity search">
      <div className="flex justify-between items-center pb-12">
        <div className={`rotate-180`}>
          {showBackButton && <SquareButton icon="rightArrowLongSmall" onClick={prevStep} />}
        </div>
        <div className="text-metadataMedium">{showTitle && 'Profile Creation'}</div>
        <SquareButton icon="close" onClick={hideOnboarding} />
      </div>

      <div className="pb-8 px-8 relative h-full">{steps[step]}</div>
    </DialogContainer>
  );
});
