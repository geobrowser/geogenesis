'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import * as Dialog from '@radix-ui/react-dialog';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useRouter } from 'next/navigation';

import * as React from 'react';
import { ChangeEvent, useCallback, useRef, useState } from 'react';

import { useDeploySpace } from '~/core/hooks/use-deploy-space';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { Services } from '~/core/services';
import { SpaceGovernanceType, SpaceType } from '~/core/types';
import { NavUtils, getImagePath, sleep } from '~/core/utils/utils';

import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Close } from '~/design-system/icons/close';
import { CloseSmall } from '~/design-system/icons/close-small';
import { QuestionCircle } from '~/design-system/icons/question-circle';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';
import { SelectEntity } from '~/design-system/select-entity';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';
import { Tooltip } from '~/design-system/tooltip';

import { Animation } from '~/partials/onboarding/dialog';

const spaceTypeAtom = atom<SpaceType | null>(null);
const governanceTypeAtom = atom<SpaceGovernanceType | null>(null);
const nameAtom = atom<string>('');
const entityIdAtom = atom<string>('');
const imageAtom = atom<string>('');
const spaceIdAtom = atom<string>('');

type Step = 'select-type' | 'select-governance' | 'enter-profile' | 'create-space' | 'completed';

const stepAtom = atom<Step>('select-type');

const workflowSteps: Array<Step> = ['create-space', 'completed'];

export function CreateSpaceDialog() {
  const smartAccount = useSmartAccount();
  const address = smartAccount?.account.address;
  const [open, onOpenChange] = useState(false);
  const { deploy } = useDeploySpace();

  const spaceType = useAtomValue(spaceTypeAtom);
  const [name, setName] = useAtom(nameAtom);
  const [entityId] = useAtom(entityIdAtom);
  const [image, setImage] = useAtom(imageAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const [governanceType, setGovernanceType] = useAtom(governanceTypeAtom);
  const [step, setStep] = useAtom(stepAtom);

  // Show retry immediately if workflow already started before initial render
  const [showRetry, setShowRetry] = useState(() => workflowSteps.includes(step));

  if (!address) return null;

  async function createSpaces(spaceType: SpaceType) {
    if (!address || !spaceType) return;

    try {
      const spaceId = await deploy({
        type: spaceType,
        spaceName: name,
        spaceImage: image,
        governanceType: governanceType ?? undefined,
        entityId,
      });

      if (!spaceId) {
        throw new Error(`Creating space failed`);
      }

      setSpaceId(spaceId);
      setStep('completed');
    } catch (error) {
      setShowRetry(true);
      console.error(error);
    }
  }

  async function onRunOnboardingWorkflow() {
    if (!address || !smartAccount || !spaceType) return;

    setShowRetry(false);

    switch (step) {
      case 'enter-profile':
        setStep('create-space');
        await sleep(100);
        createSpaces(spaceType);
        break;
      case 'create-space':
        createSpaces(spaceType);
        break;
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger
        onClick={() => {
          setName('');
          setImage('');
          setGovernanceType(null);
          setStep('select-type');
        }}
      >
        New space
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          // Only allow closing the dialog by clicking the close button
          onEscapeKeyDown={e => {
            e.preventDefault();
          }}
          onPointerDownOutside={e => {
            e.preventDefault();
          }}
          onInteractOutside={e => {
            e.preventDefault();
          }}
        >
          <div className="pointer-events-none fixed inset-0 z-100 flex h-full w-full items-start justify-center bg-grey-04/50">
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ type: 'tween', ease: 'easeInOut', duration: 0.15 }}
                className="relative z-10 flex h-full w-full items-start justify-center"
              >
                <ModalCard childKey="card">
                  <StepHeader />
                  {step === 'select-type' && <StepSelectType />}
                  {step === 'select-governance' && <SelectGovernanceType />}
                  {step === 'enter-profile' && <StepEnterProfile onNext={onRunOnboardingWorkflow} address={address} />}
                  {workflowSteps.includes(step) && (
                    <StepComplete
                      onRetry={onRunOnboardingWorkflow}
                      showRetry={showRetry}
                      onDone={() => onOpenChange(false)}
                    />
                  )}
                </ModalCard>
              </motion.div>
            </AnimatePresence>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type ModalCardProps = {
  childKey: string;
  children: React.ReactNode;
};

const ModalCard = ({ childKey, children }: ModalCardProps) => {
  return (
    <motion.div
      key={childKey}
      initial={{ opacity: 0, bottom: -5 }}
      animate={{ opacity: 1, bottom: 0 }}
      exit={{ opacity: 0, bottom: -5 }}
      transition={{ ease: 'easeInOut', duration: 0.225 }}
      className="pointer-events-auto relative z-100 mt-40 flex h-[440px] w-full max-w-[360px] flex-col overflow-hidden rounded-lg border border-grey-02 bg-white p-4 shadow-dropdown"
    >
      {children}
    </motion.div>
  );
};

const headerText: Record<Step, string> = {
  'select-type': 'Select space template',
  'select-governance': 'Governance type',
  'enter-profile': '',
  'create-space': '',
  completed: '',
};

const StepHeader = () => {
  const spaceType = useAtomValue(spaceTypeAtom);
  const [step, setStep] = useAtom(stepAtom);

  // @TODO: Governance type
  const showBack = step === 'select-governance' || step === 'enter-profile';

  const handleBack = () => {
    switch (step) {
      case 'select-governance':
        setStep('select-type');
        break;
      case 'enter-profile':
        if (spaceType === 'default') {
          setStep('select-governance');
        } else {
          setStep('select-type');
        }
        break;
      default:
        break;
    }
  };

  return (
    <div className="relative z-20 flex items-center justify-between pb-2">
      <div className="rotate-180">
        {showBack ? (
          <SquareButton icon={<RightArrowLongSmall />} onClick={handleBack} className="!border-none !bg-transparent" />
        ) : (
          <div className="h-1 w-4" />
        )}
      </div>
      <h3 className="text-smallTitle">{headerText[step]}</h3>
      {step !== 'create-space' && step !== 'completed' ? (
        <Dialog.Close asChild>
          <SquareButton icon={<Close color="grey-04" />} className="!border-none !bg-transparent" />
        </Dialog.Close>
      ) : (
        // Render an empty span to position header text in the middle
        <div className="h-1 w-4" />
      )}
    </div>
  );
};

type StepContentsProps = {
  childKey: string;
  children: React.ReactNode;
};

const StepContents = ({ childKey, children }: StepContentsProps) => {
  return (
    <motion.div
      key={childKey}
      initial={{ opacity: 0, right: -20 }}
      animate={{ opacity: 1, left: 0, right: 0 }}
      exit={{ opacity: 0, left: -20 }}
      transition={{ ease: 'easeInOut', duration: 0.225 }}
      className="relative flex flex-grow flex-col"
    >
      {children}
    </motion.div>
  );
};

function StepSelectType() {
  const setSpaceType = useSetAtom(spaceTypeAtom);
  const setGovernanceType = useSetAtom(governanceTypeAtom);
  const setStep = useSetAtom(stepAtom);

  return (
    <>
      <StepContents childKey="account-type">
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {spaceTypeOptions.map(spaceType => {
            return (
              <button
                key={spaceType.value}
                onClick={() => {
                  setSpaceType(spaceType.value);

                  if (spaceType.value === 'default') {
                    setGovernanceType(null);
                    setStep('select-governance');
                  } else {
                    if (spaceType.governance) {
                      setGovernanceType(spaceType.governance);
                    }
                    setStep('enter-profile');
                  }
                }}
                className="flex items-center gap-3 rounded-lg border border-divider bg-white  py-2 pl-2 pr-3 transition-colors duration-150 ease-in-out hover:bg-divider"
              >
                <div className="size-8 flex-shrink-0 overflow-clip rounded">
                  <img src={spaceType.image} alt="" className="block h-full w-full object-cover" />
                </div>
                <div className="text-button">{spaceType.label}</div>
              </button>
            );
          })}
        </div>
      </StepContents>
    </>
  );
}

const spaceTypeOptions: { image: string; label: string; value: SpaceType; governance?: 'PUBLIC' | 'PERSONAL' }[] = [
  { image: '/images/onboarding/blank.png', label: 'Blank', value: 'default' },
  {
    image: '/images/onboarding/academic-field.png',
    label: 'Academic field',
    value: 'academic-field',
    governance: 'PERSONAL',
  },
  { image: '/images/onboarding/company.png', label: 'Company', value: 'company', governance: 'PERSONAL' },
  { image: '/images/onboarding/dao.png', label: 'DAO', value: 'dao', governance: 'PERSONAL' },
  {
    image: '/images/onboarding/gov-org.png',
    label: 'Government org',
    value: 'government-org',
    governance: 'PERSONAL',
  },
  { image: '/images/onboarding/industry.png', label: 'Industry', value: 'industry', governance: 'PERSONAL' },
  {
    image: '/images/onboarding/interest-group.png',
    label: 'Interest',
    value: 'interest',
    governance: 'PERSONAL',
  },
  { image: '/images/onboarding/region.png', label: 'Region', value: 'region', governance: 'PERSONAL' },
  { image: '/images/onboarding/nonprofit.png', label: 'Nonprofit', value: 'nonprofit', governance: 'PERSONAL' },
  { image: '/images/onboarding/protocol.png', label: 'Protocol', value: 'protocol', governance: 'PERSONAL' },
];

function SelectGovernanceType() {
  const setGovernanceType = useSetAtom(governanceTypeAtom);
  const setStep = useSetAtom(stepAtom);

  return (
    <>
      <StepContents childKey="account-type">
        <div className="mt-3 flex flex-grow flex-col gap-3">
          {governanceTypeOptions.map(({ label, value, image, sublabel }) => {
            return (
              <GovernanceTypeButton
                key={value}
                onClick={() => {
                  setGovernanceType(value);
                  setStep('enter-profile');
                }}
                label={label}
                image={image}
                sublabel={sublabel}
              />
            );
          })}
        </div>
      </StepContents>
    </>
  );
}

type GovernanceTypeOption = {
  label: string;
  value: 'PUBLIC' | 'PERSONAL';
  sublabel: string;
  image: string;
};

const governanceTypeOptions: GovernanceTypeOption[] = [
  {
    label: 'Public',
    value: 'PUBLIC',
    image: '/images/onboarding/public.png',
    sublabel: 'All proposed edits go through governance and are either accepted or rejected by the Editors.',
  },
  {
    label: 'Personal',
    value: 'PERSONAL',
    image: '/images/onboarding/personal.png',
    sublabel: 'All edits are automatically added without a voting period.',
  },
];

type StepEnterProfileProps = {
  onNext: () => void;
  address: string;
};

const allowedTypesBySpaceType: Record<SpaceType, string[]> = {
  default: [SYSTEM_IDS.SPACE_TYPE, SYSTEM_IDS.PROJECT_TYPE],
  company: [SYSTEM_IDS.SPACE_TYPE, SYSTEM_IDS.PROJECT_TYPE, SYSTEM_IDS.COMPANY_TYPE],
  nonprofit: [SYSTEM_IDS.SPACE_TYPE, SYSTEM_IDS.PROJECT_TYPE, SYSTEM_IDS.NONPROFIT_TYPE],
  personal: [SYSTEM_IDS.SPACE_TYPE, SYSTEM_IDS.PROJECT_TYPE, SYSTEM_IDS.PERSON_TYPE],
  'academic-field': [SYSTEM_IDS.SPACE_TYPE, SYSTEM_IDS.PROJECT_TYPE, SYSTEM_IDS.ACADEMIC_FIELD_TYPE],
  region: [SYSTEM_IDS.SPACE_TYPE, SYSTEM_IDS.PROJECT_TYPE, SYSTEM_IDS.REGION_TYPE],
  industry: [SYSTEM_IDS.SPACE_TYPE, SYSTEM_IDS.PROJECT_TYPE, SYSTEM_IDS.INDUSTRY_TYPE],
  protocol: [SYSTEM_IDS.SPACE_TYPE, SYSTEM_IDS.PROJECT_TYPE, SYSTEM_IDS.PROTOCOL_TYPE],
  dao: [SYSTEM_IDS.SPACE_TYPE, SYSTEM_IDS.PROJECT_TYPE, SYSTEM_IDS.DAO_TYPE],
  'government-org': [SYSTEM_IDS.SPACE_TYPE, SYSTEM_IDS.PROJECT_TYPE, SYSTEM_IDS.GOVERNMENT_ORG_TYPE],
  interest: [SYSTEM_IDS.SPACE_TYPE, SYSTEM_IDS.PROJECT_TYPE, SYSTEM_IDS.INTEREST_TYPE],
};

function StepEnterProfile({ onNext }: StepEnterProfileProps) {
  const { ipfs } = Services.useServices();
  const [name, setName] = useAtom(nameAtom);
  const [, setEntityId] = useAtom(entityIdAtom);
  const spaceType = useAtomValue(spaceTypeAtom);
  const isCompany = spaceType === 'company';
  const [image, setImage] = useAtom(imageAtom);

  // @TODO remove console.info for spaceType
  console.info('spaceType:', spaceType);

  const allowedTypes = spaceType ? allowedTypesBySpaceType[spaceType] : [];
  const validName = name.length > 0;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      const ipfsUri = await ipfs.uploadFile(file);
      setImage(ipfsUri);
    }
  };

  const governanceType = useAtomValue(governanceTypeAtom);

  if (!governanceType) return null;

  return (
    <div className="space-y-4">
      <StepContents childKey="onboarding">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="group relative overflow-hidden rounded-lg shadow-lg">
              {isCompany ? (
                <>
                  {image ? (
                    <>
                      <div
                        style={{
                          backgroundImage: `url(${getImagePath(image)})`,
                          height: 152,
                          width: 152,
                          backgroundSize: 'cover',
                          backgroundRepeat: 'no-repeat',
                        }}
                      />
                      <div className="absolute right-0 top-0 p-1.5 opacity-0 transition-opacity duration-200 ease-in-out group-hover:opacity-100">
                        <SquareButton disabled={image === ''} onClick={() => setImage('')} icon={<Trash />} />
                      </div>
                    </>
                  ) : (
                    <img src="/images/onboarding/no-avatar.png" alt="" className="size-[152px] object-cover" />
                  )}
                </>
              ) : (
                <>
                  {image ? (
                    <>
                      <div
                        style={{
                          backgroundImage: `url(${getImagePath(image)})`,
                          height: 100,
                          width: 250,
                          backgroundSize: 'cover',
                          backgroundRepeat: 'no-repeat',
                        }}
                      />
                      <div className="absolute right-0 top-0 p-1.5 opacity-0 transition-opacity duration-200 ease-in-out group-hover:opacity-100">
                        <SquareButton disabled={image === ''} onClick={() => setImage('')} icon={<Trash />} />
                      </div>
                    </>
                  ) : (
                    <img src="/placeholder-cover.png" alt="" className="h-[100px] w-[250px] object-cover" />
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center justify-center gap-1.5 pb-4">
            <label htmlFor="file" className="inline-block cursor-pointer text-center hover:underline">
              <SmallButton icon={<Upload />} onClick={handleFileInputClick}>
                Upload {isCompany ? 'Avatar' : 'Cover'}
              </SmallButton>
            </label>
            <input
              ref={fileInputRef}
              accept="image/png, image/jpeg"
              id="file"
              onChange={handleChange}
              type="file"
              className="hidden"
            />
          </div>
        </div>
      </StepContents>
      <div className={cx('flex w-full flex-col items-center justify-center gap-3', !isCompany && 'pt-[26px]')}>
        <div className="relative z-100 inline-block">
          <div className={cx(name && 'invisible')}>
            <SelectEntity
              allowedTypes={allowedTypes}
              onDone={entity => {
                setName(entity.name ?? '');
                setEntityId(entity.id);
              }}
              onCreateEntity={entity => {
                setName(entity.name ?? '');
                setEntityId('');
              }}
              spaceId={SYSTEM_IDS.ROOT_SPACE_ID}
              width="full"
              variant="fixed"
              placeholder="Space name..."
              inputClassName="block px-2 py-1 text-center !text-2xl text-mediumTitle placeholder:opacity-25 focus:!outline-none"
              withSelectSpace={false}
            />
          </div>
          {name && (
            <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-1">
              <div className="text-bodySemibold">Space for</div>
              <SmallButton
                onClick={() => {
                  setName('');
                  setEntityId('');
                }}
              >
                <span>{name}</span>
                <CloseSmall />
              </SmallButton>
            </div>
          )}
        </div>
      </div>
      <div className="absolute inset-x-4 bottom-4 flex">
        <div className="absolute left-0 right-0 top-0 z-100 flex -translate-y-full justify-center pb-4">
          <Tooltip
            trigger={
              <div className="inline-flex cursor-pointer items-center gap-1 text-grey-04">
                <Text as="h3" variant="footnote" className="text-center">
                  {governanceText[governanceType]}
                </Text>
                <div>
                  <QuestionCircle />
                </div>
              </div>
            }
            label={governanceLabel[governanceType]}
            position="top"
          />
        </div>
        <Button disabled={!validName} onClick={onNext} className="w-full">
          Create Space
        </Button>
      </div>
    </div>
  );
}

const governanceText: Record<SpaceGovernanceType, string> = {
  PERSONAL: 'Personal access controls',
  PUBLIC: 'Public governance',
};

const governanceLabel: Record<SpaceGovernanceType, string> = {
  PERSONAL: 'A vote isn’t required to publish edits in this space',
  PUBLIC: 'A vote is required to publish edits in this space',
};

type StepCompleteProps = {
  onRetry: () => void;
  onDone: () => void;
  showRetry: boolean;
};

function StepComplete({ onRetry, showRetry, onDone }: StepCompleteProps) {
  const router = useRouter();

  const spaceId = useAtomValue(spaceIdAtom);
  const step = useAtomValue(stepAtom);

  const hasCompleted = step === 'completed';

  if (hasCompleted) {
    setTimeout(() => {
      onDone();
      const destination = NavUtils.toSpace(spaceId);
      router.push(destination);
    }, 3_600);
  }

  return (
    <>
      <StepContents childKey="start">
        <div className="flex w-full flex-col items-center pt-3">
          <Text as="h3" variant="bodySemibold" className={cx('mx-auto text-center !text-2xl')}>
            {step === 'completed' ? `Finalizing details...` : `Creating space...`}
          </Text>
          <Text as="p" variant="body" className="mx-auto mt-2 px-4 text-center !text-base">
            Get ready to experience a new way of creating and sharing knowledge.
          </Text>
          {step !== 'completed' && (
            <>
              <Spacer height={32} />
              {showRetry && (
                <p className=" mt-4 text-center text-smallButton">
                  Space creation failed
                  <button onClick={onRetry} className="text-ctaPrimary">
                    Retry
                  </button>
                </p>
              )}
            </>
          )}
        </div>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4">
        <div className="absolute left-0 right-0 top-0 z-10 flex -translate-y-1/2 justify-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-white shadow-card">
            <Dots />
          </div>
        </div>
        <div className="relative z-0">
          <Animation active={hasCompleted} />
        </div>
      </div>
    </>
  );
}

type GovernanceTypeButtonProps = {
  onClick: () => void;
  label: string;
  sublabel: string;
  image: string;
};

function GovernanceTypeButton({ onClick, label, image, sublabel }: GovernanceTypeButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex flex-1 flex-grow items-center justify-between rounded-lg border border-divider bg-white p-4 text-text transition-all duration-300 hover:bg-divider'
      )}
    >
      <div className="space-y-7">
        <div className="space-y-2">
          <h4 className="text-quoteMedium">{label}</h4>
          <p className="text-metadata">{sublabel}</p>
        </div>
        <img src={image} alt={label} className="max-h-6 w-auto" />
      </div>
    </button>
  );
}
