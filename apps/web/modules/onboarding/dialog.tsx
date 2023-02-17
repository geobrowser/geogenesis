import styled from '@emotion/styled';
import { observer } from '@legendapp/state/react';
import { Command } from 'cmdk';
import { ChangeEvent, useState } from 'react';
import { useAccount } from 'wagmi';
import { GeoLogoLarge } from '~/modules/design-system/icons/geo-logo-large';
import { Avatar } from '../avatar';
import { Button, SquareButton } from '../design-system/button';
import { Text } from '../design-system/text';
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
  const validName = name.length > 0;

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
      <Text as="h3" variant="bodySemibold" className="text-center">
        You can use your real name or a pseudonym if you’d prefer to remain anonymous.
      </Text>

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
      <Text as={'h3'} variant={'smallTitle'} className="text-center pb-4  -mt-6">
        {name}
      </Text>
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
        <label htmlFor="avatar-file" className="text-center cursor-pointer hover:underline inline-block">
          <Text variant="metadataMedium" color="ctaPrimary">
            Upload photo
          </Text>
        </label>
        <input accept="image/png, image/jpeg" id="avatar-file" onChange={handleChange} type="file" className="hidden" />
      </div>
      <div className="flex justify-center absolute bottom-6 inset-x-0">
        <Button onClick={nextStep}>Done</Button>
      </div>
    </div>
  );
}

export function StepSuccess() {
  return (
    <div className="h-full pt-8">
      <div className="flex justify-center">
        <div className="bg-white text-center shadow-onboarding inline-block py-2 px-8 rounded">
          <div className="justify-center flex w-full pb-3">
            <GeoLogoLarge width={67} height={67} />
          </div>
          <Text as={'h3'} variant={'input'}>
            Welcome to
          </Text>
          <Text as={'h3'} variant={'largeTitle'} className="-mt-1">
            Geo
          </Text>
        </div>
      </div>

      <div className="flex justify-center absolute bottom-6 inset-x-0">
        <Button>View Profile</Button>
      </div>
    </div>
  );
}

type Steps = 'wallet' | 'name' | 'avatar' | 'success';

const StepHeader = ({ prevStep, showTitle = true }: { prevStep?: () => void; showTitle?: boolean }) => {
  const { hideOnboarding } = useOnboarding();

  return (
    <div className="flex justify-between items-center pb-12">
      <div className="rotate-180">{prevStep && <SquareButton icon="rightArrowLongSmall" onClick={prevStep} />}</div>
      <div className="text-metadataMedium">{showTitle && 'Profile Creation'}</div>
      <SquareButton icon="close" onClick={hideOnboarding} />
    </div>
  );
};

export const OnboardingDialog = observer(() => {
  const { isOnboardingVisible } = useOnboarding();
  const { address } = useAccount();

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [step, setStep] = useState<Steps>('wallet');

  if (!address) return null;

  // Note: set open to true or to isOnboardingVisible.get() to see the onboarding flow
  // Currently stubbed as we don't have a way to create a profile yet
  return (
    <DialogContainer open={isOnboardingVisible.get()} label="Entity search">
      <div className="relative z-10 h-full">
        {step === 'wallet' && (
          <>
            <StepHeader />
            <StepWallet nextStep={() => setStep('name')} address={address} />
          </>
        )}
        {step === 'name' && (
          <>
            <StepHeader prevStep={() => setStep('wallet')} />
            <StepName nextStep={() => setStep('avatar')} setName={setName} name={name} />
          </>
        )}
        {step === 'avatar' && (
          <>
            <StepHeader prevStep={() => setStep('name')} />
            <StepAvatar
              nextStep={() => setStep('success')}
              avatar={avatar}
              setAvatar={setAvatar}
              name={name}
              address={address}
            />
          </>
        )}
        {step === 'success' && (
          <>
            <StepHeader showTitle={false} />
            <StepSuccess />
          </>
        )}
      </div>

      {step === 'success' && <img src="/mosaic.png" className="absolute -z-1 inset-0 w-full h-full object-cover" />}
    </DialogContainer>
  );
});
