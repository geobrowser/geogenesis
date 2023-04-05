import { observer } from '@legendapp/state/react';
import { Command } from 'cmdk';
import BoringAvatar from 'boring-avatars';
import { AnimatePresence, motion } from 'framer-motion';
import Confetti from 'js-confetti';
import * as React from 'react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';

import { GeoLogoLarge } from '~/modules/design-system/icons/geo-logo-large';
import { Button, SquareButton } from '../design-system/button';
import { Text } from '../design-system/text';
import { Services } from '../services';
import { formatShortAddress } from '../utils';
import { useOnboarding } from './use-onboarding';

type Steps = 'wallet' | 'name' | 'avatar' | 'success';

export const OnboardingDialog = observer(() => {
  const { isOnboardingVisible } = useOnboarding();
  const { address } = useAccount();

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [step, setStep] = useState<Steps>('wallet');

  if (!address) return null;

  // Note: set open to true or to isOnboardingVisible to see the onboarding flow
  // Currently stubbed as we don't have a way to create a profile yet
  // Also note that setting open to true will cause SSR issues in dev mode
  return (
    <Command.Dialog open={false} label="Onboarding profile">
      <div className="pointer-events-none fixed inset-0 z-100 flex h-full w-full items-start justify-center bg-grey-04/50">
        <AnimatePresence initial={false} mode="wait">
          {step !== 'success' && (
            <ModalCard key="onboarding">
              <div className="relative z-10 min-h-full">
                {step === 'wallet' && (
                  <>
                    <StepHeader />
                    <StepWallet onNext={() => setStep('name')} address={address} />
                  </>
                )}
                {step === 'name' && (
                  <>
                    <StepHeader onPrev={() => setStep('wallet')} />
                    <StepName onNext={() => setStep('avatar')} setName={setName} name={name} />
                  </>
                )}
                {step === 'avatar' && (
                  <>
                    <StepHeader onPrev={() => setStep('name')} />
                    <StepAvatar
                      onNext={() => setStep('success')}
                      avatar={avatar}
                      setAvatar={setAvatar}
                      name={name}
                      address={address}
                    />
                  </>
                )}
              </div>
            </ModalCard>
          )}
          {step === 'success' && (
            <ModalCard key="success">
              <StepHeader showTitle={false} />
              <StepSuccess />
            </ModalCard>
          )}
        </AnimatePresence>
      </div>
    </Command.Dialog>
  );
});

type ModalCardProps = {
  key: string;
  children: React.ReactNode;
};

const ModalCard = ({ key, children }: ModalCardProps) => {
  return (
    <motion.div
      key={key}
      initial={{ opacity: 0, bottom: -5 }}
      animate={{ opacity: 1, bottom: 0 }}
      exit={{ opacity: 0, bottom: -5 }}
      transition={{ ease: 'easeInOut', duration: 0.225 }}
      className="pointer-events-auto relative z-10 mt-32 aspect-square w-full max-w-[434px] overflow-hidden rounded border border-grey-02 bg-white p-4 shadow-dropdown"
    >
      {children}
    </motion.div>
  );
};

type StepHeaderProps = {
  onPrev?: () => void;
  showTitle?: boolean;
};

const StepHeader = ({ onPrev, showTitle = true }: StepHeaderProps) => {
  const { hideOnboarding } = useOnboarding();

  return (
    <div className="relative z-20 flex items-center justify-between pb-12">
      <div className="rotate-180">{onPrev && <SquareButton icon="rightArrowLongSmall" onClick={onPrev} />}</div>
      <div className="text-metadataMedium">{showTitle && 'Profile Creation'}</div>
      <SquareButton icon="close" onClick={hideOnboarding} />
    </div>
  );
};

type StepContentsProps = {
  key: string;
  children: React.ReactNode;
};

const StepContents = ({ key, children }: StepContentsProps) => {
  return (
    <motion.div
      key={key}
      initial={{ opacity: 0, right: -20 }}
      animate={{ opacity: 1, left: 0, right: 0 }}
      exit={{ opacity: 0, left: -20 }}
      transition={{ ease: 'easeInOut', duration: 0.225 }}
      className="relative"
    >
      {children}
    </motion.div>
  );
};

function StepWallet({ onNext, address }: { onNext: () => void; address: string }) {
  return (
    <>
      <StepContents key="wallet">
        <div className="flex justify-center pb-8">
          <Text variant="mediumTitle" className="inline-block rounded bg-divider px-2 py-1">
            {formatShortAddress(address)}
          </Text>
        </div>
        <div className="px-16 pb-3 text-center">
          <Text variant="bodySemibold">It looks like you don’t have a Geo profile on this wallet address.</Text>
        </div>
      </StepContents>
      <div className="absolute inset-x-0 bottom-6 flex justify-center">
        <Button onClick={onNext}>Create Profile</Button>
      </div>
    </>
  );
}

type StepNameProps = {
  onNext: () => void;
  name: string;
  setName: (name: string) => void;
};

function StepName({ onNext, name, setName }: StepNameProps) {
  const validName = name.length > 0;

  return (
    <>
      <StepContents key="name">
        <div className="flex justify-center">
          <div className="inline-block pb-8">
            <input
              placeholder="Name..."
              className="block px-2 py-1 text-center text-mediumTitle"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <Text as="h3" variant="bodySemibold" className="px-16 text-center">
          You can use your real name or a pseudonym if you’d prefer to remain anonymous.
        </Text>
      </StepContents>
      <div className="absolute inset-x-0 bottom-6 flex justify-center">
        <Button disabled={!validName} onClick={onNext}>
          Continue
        </Button>
      </div>
    </>
  );
}

type StepAvatarProps = {
  onNext: () => void;
  avatar: string;
  setAvatar: (file: string) => void;
  name: string;
  address: string;
};

function StepAvatar({ onNext, name, avatar, setAvatar, address }: StepAvatarProps) {
  const { network } = Services.useServices();

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      const ipfsUri = await network.uploadFile(file);
      setAvatar(ipfsUri);
    }
  };

  return (
    <>
      <StepContents key="avatar">
        <Text as="h3" variant="smallTitle" className="-mt-6 pb-4 text-center">
          {name}
        </Text>
        <div className="flex justify-center pb-4">
          {avatar ? (
            <div
              className="rounded border-8 border-black bg-cover bg-center"
              style={{
                backgroundImage: `url(${avatar})`,
                height: 154,
                width: 154,
              }}
            />
          ) : (
            <BoringAvatar size={154} name={address} variant="pixel" />
          )}
        </div>
        <div className="flex justify-center">
          <label htmlFor="avatar-file" className="inline-block cursor-pointer text-center hover:underline">
            <Text variant="metadataMedium" color="ctaPrimary">
              Upload photo
            </Text>
          </label>
          <input
            accept="image/png, image/jpeg"
            id="avatar-file"
            onChange={handleChange}
            type="file"
            className="hidden"
          />
        </div>
      </StepContents>
      <div className="absolute inset-x-0 bottom-6 flex justify-center">
        <Button onClick={onNext}>Done</Button>
      </div>
    </>
  );
}

function StepSuccess() {
  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const confettiRef = useRef<Confetti>(null!);

  useEffect(() => {
    confettiRef.current = new Confetti({ canvas: canvasRef.current });

    setTimeout(() => {
      confettiRef.current.addConfetti({
        confettiRadius: 6,
        confettiNumber: 500,
      });
    }, 675);

    return confettiRef.current.clearCanvas();
  }, []);

  return (
    <div className="h-full pt-8">
      <canvas ref={canvasRef} className="absolute inset-0 z-0 h-full w-full bg-[#000000]" />
      <div className="relative z-10 flex justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring', bounce: 0.25, delay: 0.45 }}
          className="inline-block rounded bg-white py-2 px-8 text-center shadow-onboarding"
        >
          <div className="flex w-full justify-center pb-3">
            <GeoLogoLarge width={67} height={67} />
          </div>
          <Text as="h3" variant="input">
            Welcome to
          </Text>
          <Text as="h3" variant="largeTitle" className="-mt-1 uppercase">
            Geo
          </Text>
        </motion.div>
      </div>
      <Marquees />
      <div className="absolute inset-x-0 bottom-6 flex justify-center">
        <Button>View Profile</Button>
      </div>
    </div>
  );
}

const Marquees = () => {
  return (
    <div className="absolute inset-0 flex h-full w-full -rotate-45 scale-[1.4] flex-col gap-4 opacity-50">
      <Marquee direction="left" />
      <Marquee direction="right" />
      <Marquee direction="left" />
      <Marquee direction="right" />
      <Marquee direction="left" />
      <Marquee direction="right" />
    </div>
  );
};

type MarqueeProps = {
  direction?: 'left' | 'right';
};

const Marquee = ({ direction = 'left' }: MarqueeProps) => {
  const [source, destination] = coordinates[direction];
  const renderedImages = direction === 'left' ? doubledImages : doubledImages.reverse();

  return (
    <div className="relative select-none overflow-hidden">
      <motion.div
        animate={{ x: [source, destination] }}
        transition={{ ease: 'linear', repeat: Infinity, repeatType: 'loop', duration: 120 }}
        className="flex gap-4"
      >
        {renderedImages.map((image: string, index: number) => (
          <img key={index} src={image} className="h-16 w-16 rounded object-cover object-center" />
        ))}
      </motion.div>
    </div>
  );
};

const coordinates = {
  left: [0, -640],
  right: [-640, 0],
};

const images: Array<string> = [
  'https://www.geobrowser.io/_next/image?url=https%3A%2F%2Fcdn.discordapp.com%2Fattachments%2F882371689244143687%2F1070102478802133052%2Froot.png&w=1920&q=75',
  'https://www.geobrowser.io/_next/image?url=https%3A%2F%2Fcdn.discordapp.com%2Fattachments%2F882371689244143687%2F1070100677516333146%2Fcrypto.png&w=1920&q=75',
  'https://www.geobrowser.io/_next/image?url=https%3A%2F%2Fcdn.discordapp.com%2Fattachments%2F882371689244143687%2F1068584818910167101%2Fabundance.png&w=1920&q=75',
  'https://www.geobrowser.io/_next/image?url=https%3A%2F%2Fcdn.discordapp.com%2Fattachments%2F882371689244143687%2F1068582532611833936%2Fpeople.png&w=1920&q=75',
  'https://www.geobrowser.io/_next/image?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1617791160536-598cf32026fb&w=1920&q=75',
  'https://www.geobrowser.io/_next/image?url=https%3A%2F%2Fcdn.discordapp.com%2Fattachments%2F1010259815395754147%2F1047945562336534588%2FSF-image.png&w=1920&q=75',
  'https://www.geobrowser.io/_next/image?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1535914254981-b5012eebbd15&w=1920&q=75',
  'https://www.geobrowser.io/_next/image?url=https%3A%2F%2Fcdn.discordapp.com%2Fattachments%2F882371689244143687%2F1068584843316830249%2Fend-homelessness.png&w=1920&q=75',
];

const doubledImages: Array<string> = [...images, ...images];
