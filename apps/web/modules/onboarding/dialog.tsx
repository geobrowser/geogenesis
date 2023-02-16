import styled from '@emotion/styled';
import { observer } from '@legendapp/state/react';
import { Command } from 'cmdk';
import { ChangeEvent, useState } from 'react';
import { useAccount } from 'wagmi';
import { GeoLogoLarge } from '~/modules/design-system/icons/geo-logo-large';
import { Avatar } from '../avatar';
import { Button, SquareButton } from '../design-system/button';
import { Services } from '../services';
import { formatAddress } from '../utils';
import { useOnboarding } from './use-onboarding';

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

export function StepWallet({ nextStep, address }: { nextStep: () => void; address: string }) {
  return (
    <div>
      <div className="flex justify-center pb-8">
        <div className="bg-divider rounded px-2 py-1 inline-block text-mediumTitle">{formatAddress(address)}</div>
      </div>
      <div className="pb-3">
        <div className="text-bodySemibold text-xl text-center">
          It looks like you don’t have a Geo profile on this wallet address.
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

export function StepAvatar({
  nextStep,
  name,
  avatar,
  setAvatar,
  address,
}: {
  nextStep: () => void;
  avatar: string;
  setAvatar: (file: string) => void;
  name: string;
  address: string;
}) {
  const { network } = Services.useServices();

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      const ipfsUri = await network.uploadFile(file);
      setAvatar(ipfsUri);
    }
  };

  return (
    <div>
      <div className="text-center pb-4 text-smallTitle -mt-6">{name}</div>
      <div className="pb-4 flex justify-center">
        {avatar ? (
          <div
            className="bg-cover bg-center border-8 border-black rounded"
            style={{
              backgroundImage: `url(${avatar})`,
              height: 154,
              width: 154,
            }}
          />
        ) : (
          <Avatar size={154} value={address} />
        )}
      </div>

      <div className="flex justify-center">
        <label className="text-ctaPrimary text-metadataMedium text-center cursor-pointer hover:underline inline-block">
          Upload photo
          <input accept="image/png, image/jpeg" onChange={handleChange} type="file" className="hidden" />
        </label>
      </div>
      <div className="flex justify-center absolute bottom-6 inset-x-0">
        <Button onClick={nextStep}>Done</Button>
      </div>
    </div>
  );
}

export function StepSuccess() {
  return (
    <>
      <div className="h-full pt-16">
        <div className="flex justify-center">
          <div className="bg-white text-center shadow-lg inline-block py-2 px-8 rounded">
            <div className="justify-center flex w-full pb-3">
              <GeoLogoLarge width={67} height={67} />
            </div>
            <div className="text-input">Welcome to</div>
            <div className="text-largeTitle -mt-1">GEO</div>
          </div>
        </div>

        <div className="flex justify-center absolute bottom-6 inset-x-0">
          <Button>View Profile</Button>
        </div>
      </div>
    </>
  );
}

export const OnboardingDialog = observer(() => {
  const { isOnboardingVisible, hideOnboarding } = useOnboarding();
  const { address } = useAccount();

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
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
    <StepWallet nextStep={nextStep} address={address} key="wallet" />,
    <StepName nextStep={nextStep} setName={setName} name={name} key="name" />,
    <StepAvatar nextStep={nextStep} avatar={avatar} setAvatar={setAvatar} name={name} address={address} key="avatar" />,
    <StepSuccess key="success" />,
  ];

  const showBackButton = step > 0 && step < steps.length - 1;
  const showTitle = step !== steps.length - 1;
  const showAnimatedBackground = step === steps.length - 1;

  // Note: set open to true or to isOnboardingVisible.get() to see the onboarding flow
  // Currently stubbed as we don't have a way to create a profile yet
  return (
    <DialogContainer open={false} label="Entity search">
      <div className="flex justify-between items-center pb-12">
        <div className={`rotate-180`}>
          {showBackButton && <SquareButton icon="rightArrowLongSmall" onClick={prevStep} />}
        </div>
        <div className="text-metadataMedium">{showTitle && 'Profile Creation'}</div>
        <SquareButton icon="close" onClick={hideOnboarding} />
      </div>

      <div className="pb-6 px-6 relative z-10 h-full">{steps[step]}</div>
      {showAnimatedBackground && <img src="/mosaic.png" className="absolute -z-1 inset-0 w-full h-full object-cover" />}
    </DialogContainer>
  );
});
