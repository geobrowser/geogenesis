import styled from '@emotion/styled';
import React, { ForwardedRef, forwardRef, useRef, useState } from 'react';
import { Button } from '../../design-system/button';
import { Copy } from '../../design-system/icons/copy';
import { Entity } from '../../design-system/icons/entity';
import { Facts } from '../../design-system/icons/facts';
import { RightArrowLong } from '../../design-system/icons/right-arrow-long';
import { Target } from '../../design-system/icons/target';
import { Spacer } from '../../design-system/spacer';
import { Text } from '../../design-system/text';
import { useRect } from '@radix-ui/react-use-rect';
import { OnboardingArrow } from './arrow';
import { motion } from 'framer-motion';
import { useWindowSize } from '~/modules/hooks/use-window-size';
import { OnboardingStep, ONBOARDING_CONTENT } from './content';
import { Select } from '~/modules/design-system/select';

const BREAKPOINT = 789;
const DEFAULT_ARROW_LEFT = 57;

const Row = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.space * 2,
}));

const OnboardingContent = styled.div(({ theme }) => ({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  border: `1px solid ${theme.colors.text}`,
  borderRadius: theme.radius,
  padding: theme.space * 5,
}));

const MotionContent = motion(OnboardingContent);

interface ArrowProps {
  left?: number;
}

const ContentArrow = styled.span<ArrowProps>(({ left = 0 }) => ({
  position: 'absolute',

  // -10 is the height of the arrow
  top: -10,

  // - 8 is the width of the arrow
  left: left - 8,
}));

const MotionArrow = motion(ContentArrow);

interface OnboardButtonProps {
  isActive: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}

const OnboardingButton = forwardRef(function OnboardingButton(
  { isActive, onClick, children }: OnboardButtonProps,
  ref: ForwardedRef<HTMLButtonElement>
) {
  return isActive ? (
    <Button ref={ref} variant="tertiary" onClick={onClick}>
      {children}
    </Button>
  ) : (
    <Button ref={ref} variant="secondary" onClick={onClick}>
      {children}
    </Button>
  );
});

function getArrowPosition(selectedArrowPosition: number, initialButtonWidth: number) {
  return selectedArrowPosition === 0 ? initialButtonWidth / 2 : selectedArrowPosition;
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
    <div ref={containerRef}>
      <Row>
        {width > BREAKPOINT ? (
          <>
            <OnboardingButton ref={initialButtonRef} onClick={onStepChange('collect')} isActive={step === 'collect'}>
              <Facts color={step === 'collect' ? 'white' : `grey-04`} />
              <Spacer width={8} />
              Collect data
            </OnboardingButton>

            <RightArrowLong color="grey-04" />

            <OnboardingButton onClick={onStepChange('organize')} isActive={step === 'organize'}>
              <Copy color={step === 'organize' ? 'white' : `grey-04`} />
              <Spacer width={8} />
              Organize data
            </OnboardingButton>

            <RightArrowLong color="grey-04" />

            <OnboardingButton onClick={onStepChange('empower')} isActive={step === 'empower'}>
              <Entity color={step === 'empower' ? 'white' : `grey-04`} />
              <Spacer width={8} />
              Empower communities
            </OnboardingButton>

            <RightArrowLong color="grey-04" />

            <OnboardingButton onClick={onStepChange('solve')} isActive={step === 'solve'}>
              <Target color={step === 'solve' ? 'white' : `grey-04`} />
              <Spacer width={8} />
              Solve real problems
            </OnboardingButton>
          </>
        ) : (
          <Select
            variant="primary"
            value={selectOptions[step].value}
            options={Object.values(selectOptions)}
            onChange={value => setStep(value as OnboardingStep)}
          />
        )}
      </Row>

      <Spacer height={22} />

      {/* Wait for the arrow position to calculate so there's no weird arrow layout shift */}
      <MotionContent initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
        <MotionArrow layout="position" left={width > BREAKPOINT ? arrowLeft : DEFAULT_ARROW_LEFT}>
          <OnboardingArrow />
        </MotionArrow>
        <Text variant="mediumTitle">{ONBOARDING_CONTENT[step].title}</Text>
        <Spacer height={4} />
        <Text>{ONBOARDING_CONTENT[step].description}</Text>
      </MotionContent>
    </div>
  );
}
