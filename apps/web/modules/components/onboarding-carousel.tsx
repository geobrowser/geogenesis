import styled from '@emotion/styled';
import { useState } from 'react';
import { Button } from '../design-system/button';
import { Copy } from '../design-system/icons/copy';
import { Entity } from '../design-system/icons/entity';
import { Facts } from '../design-system/icons/facts';
import { RightArrowLong } from '../design-system/icons/right-arrow-long';
import { Target } from '../design-system/icons/target';
import { Spacer } from '../design-system/spacer';

const Row = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.space * 2,
}));

interface OnboardButtonProps {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

export function OnboardingButton({ isActive, onClick, children }: OnboardButtonProps) {
  return isActive ? (
    <Button variant="teriary" onClick={onClick}>
      {children}
    </Button>
  ) : (
    <Button variant="secondary" onClick={onClick}>
      {children}
    </Button>
  );
}

export function OboardingCarousel() {
  const [step, setStep] = useState<'collect' | 'organize' | 'empower' | 'solve'>('collect');

  return (
    <Row>
      <OnboardingButton onClick={() => setStep('collect')} isActive={step === 'collect'}>
        <Facts color={step === 'collect' ? 'white' : `grey-04`} />
        <Spacer width={8} />
        Collect data
      </OnboardingButton>

      <RightArrowLong color="grey-04" />

      <OnboardingButton onClick={() => setStep('organize')} isActive={step === 'organize'}>
        <Copy color={step === 'organize' ? 'white' : `grey-04`} />
        <Spacer width={8} />
        Organize data
      </OnboardingButton>

      <RightArrowLong color="grey-04" />

      <OnboardingButton onClick={() => setStep('empower')} isActive={step === 'empower'}>
        <Entity color={step === 'empower' ? 'white' : `grey-04`} />
        <Spacer width={8} />
        Empower communities
      </OnboardingButton>

      <RightArrowLong color="grey-04" />

      <OnboardingButton onClick={() => setStep('solve')} isActive={step === 'solve'}>
        <Target color={step === 'solve' ? 'white' : `grey-04`} />
        <Spacer width={8} />
        Solve real problems
      </OnboardingButton>
    </Row>
  );
}
