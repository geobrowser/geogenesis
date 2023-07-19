'use client';

import * as React from 'react';
import { useRef, useState } from 'react';
import { useRect } from '@radix-ui/react-use-rect';
import { motion } from 'framer-motion';

import { RightArrowLong } from '../../design-system/icons/right-arrow-long';
import { Spacer } from '../../design-system/spacer';
import { Text } from '../../design-system/text';
import { useWindowSize } from '~/modules/hooks/use-window-size';
import { OnboardingStep, ONBOARDING_CONTENT } from './content';
import { Select } from '~/modules/design-system/select';
import { TabButton } from '~/modules/design-system/tab-button';
import { CaretUp } from '~/modules/design-system/icons/caret-up';

const BREAKPOINT = 789;
const DEFAULT_ARROW_LEFT = 62;

function getArrowPosition(selectedArrowPosition: number, initialButtonWidth: number) {
  return selectedArrowPosition === 0 ? initialButtonWidth / 2 + DEFAULT_ARROW_LEFT : selectedArrowPosition;
}

const selectOptions: Record<OnboardingStep, { label: string; value: OnboardingStep }> = {
  collect: {
    label: 'Collect data',
    value: 'collect',
  },
  organize: {
    label: 'Organize data',
    value: 'organize',
  },
  empower: {
    label: 'Empower communities',
    value: 'empower',
  },
  solve: {
    label: 'Solve real problems',
    value: 'solve',
  },
};

export function OboardingCarousel() {
  const [step, setStep] = useState<OnboardingStep>('collect');
  const containerRef = useRef<HTMLDivElement>(null);
  const containerRect = useRect(containerRef.current);
  const initialButtonRef = useRef<HTMLButtonElement>(null);
  const initialButtonRect = useRect(initialButtonRef.current);
  const [selectedArrowLeft, setArrowLeft] = useState(0);
  const { width } = useWindowSize();

  const onStepChange = (step: OnboardingStep) => (event: React.MouseEvent<HTMLButtonElement>) => {
    // Position the arrow relative to the button that was clicked
    setArrowLeft(event.currentTarget.offsetLeft + event.currentTarget.clientWidth / 2 - (containerRect?.left ?? 0));
    setStep(step);
  };

  // Set the initial value of the arrow position to the first button in the row
  const arrowLeft = getArrowPosition(selectedArrowLeft, initialButtonRect?.width ?? 0);

  return (
    <div ref={containerRef} className="self-center">
      <div className="flex items-center justify-center gap-2">
        {width > BREAKPOINT ? (
          <>
            <TabButton
              ref={initialButtonRef}
              onClick={onStepChange('collect')}
              icon="facts"
              isActive={step === 'collect'}
            >
              Collect data
            </TabButton>
            <RightArrowLong color="grey-04" />
            <TabButton icon="organize-data" onClick={onStepChange('organize')} isActive={step === 'organize'}>
              Organize data
            </TabButton>
            <RightArrowLong color="grey-04" />
            <TabButton icon="entity" onClick={onStepChange('empower')} isActive={step === 'empower'}>
              Empower communities
            </TabButton>
            <RightArrowLong color="grey-04" />
            <TabButton icon="target" onClick={onStepChange('solve')} isActive={step === 'solve'}>
              Solve real problems
            </TabButton>
          </>
        ) : (
          <Select
            variant="primary"
            value={selectOptions[step].value}
            options={Object.values(selectOptions)}
            onChange={value => setStep(value as OnboardingStep)}
          />
        )}
      </div>
      <Spacer height={22} />
      {/* Wait for the arrow position to calculate so there's no weird arrow layout shift */}
      <motion.div
        className="relative flex max-w-[880px] flex-col rounded border border-text p-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        <motion.span
          className="absolute -top-[10px] inline-block"
          layout="position"
          style={{ left: width > BREAKPOINT ? arrowLeft - 8 : DEFAULT_ARROW_LEFT - 8 }}
        >
          <CaretUp />
        </motion.span>
        <Text variant="mediumTitle">{ONBOARDING_CONTENT[step].title}</Text>
        <Spacer height={4} />
        <Text>{ONBOARDING_CONTENT[step].description}</Text>
      </motion.div>
    </div>
  );
}
