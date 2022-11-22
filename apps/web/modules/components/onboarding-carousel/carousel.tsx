import styled from '@emotion/styled';
import React, { useRef, useState } from 'react';
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
import { ToggleButton } from '~/modules/design-system/toggle-button';

const BREAKPOINT = 789;
const DEFAULT_ARROW_LEFT = 62;

const Column = styled.div({
  alignSelf: 'center',
});

const Row = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: theme.space * 2,
}));

const OnboardingContent = styled.div(({ theme }) => ({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  border: `1px solid ${theme.colors.text}`,
  borderRadius: theme.radius,
  padding: theme.space * 5,
  maxWidth: 880,
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
    <Column ref={containerRef}>
      <Row>
        {width > BREAKPOINT ? (
          <>
            <ToggleButton
              ref={initialButtonRef}
              onClick={onStepChange('collect')}
              icon="facts"
              isActive={step === 'collect'}
            >
              Collect data
            </ToggleButton>

            <RightArrowLong color="grey-04" />

            <ToggleButton icon="copy" onClick={onStepChange('organize')} isActive={step === 'organize'}>
              Organize data
            </ToggleButton>

            <RightArrowLong color="grey-04" />

            <ToggleButton icon="entity" onClick={onStepChange('empower')} isActive={step === 'empower'}>
              Empower communities
            </ToggleButton>

            <RightArrowLong color="grey-04" />

            <ToggleButton icon="target" onClick={onStepChange('solve')} isActive={step === 'solve'}>
              Solve real problems
            </ToggleButton>
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
      <MotionContent initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.5 }}>
        <MotionArrow layout="position" left={width > BREAKPOINT ? arrowLeft : DEFAULT_ARROW_LEFT}>
          <OnboardingArrow />
        </MotionArrow>
        <Text variant="mediumTitle">{ONBOARDING_CONTENT[step].title}</Text>
        <Spacer height={4} />
        <Text>{ONBOARDING_CONTENT[step].description}</Text>
      </MotionContent>
    </Column>
  );
}
