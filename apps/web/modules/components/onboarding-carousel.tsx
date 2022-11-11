import styled from '@emotion/styled';
import { ForwardedRef, forwardRef, useEffect, useRef, useState } from 'react';
import { Button } from '../design-system/button';
import { Copy } from '../design-system/icons/copy';
import { Entity } from '../design-system/icons/entity';
import { Facts } from '../design-system/icons/facts';
import { RightArrowLong } from '../design-system/icons/right-arrow-long';
import { Target } from '../design-system/icons/target';
import { Spacer } from '../design-system/spacer';
import { Text } from '../design-system/text';
import { useRect } from '@radix-ui/react-use-rect';
import { Dialog } from './onboarding-dialog';

const Row = styled.div(({ theme }) => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: theme.space * 2,
}));

interface DialogContentProps {
  left?: number;
  top?: number;
}

const DialogContent = styled.div<DialogContentProps>(({ theme, left = 0, top = 0 }) => ({
  position: 'absolute',
  top: top + theme.space * 3,
  left: left,
  display: 'flex',
  flexDirection: 'column',
  border: `1px solid ${theme.colors.text}`,
  borderRadius: theme.radius,
  padding: theme.space * 5,
  width: 1060,
}));

interface OnboardButtonProps {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const OnboardingButton = forwardRef(function OnboardingButton(
  { isActive, onClick, children }: OnboardButtonProps,
  ref: ForwardedRef<HTMLButtonElement>
) {
  return isActive ? (
    <Button ref={ref} variant="teriary" onClick={onClick}>
      {children}
    </Button>
  ) : (
    <Button ref={ref} variant="secondary" onClick={onClick}>
      {children}
    </Button>
  );
});

type DialogChoice = 'collect' | 'organize' | 'empower' | 'solve';

const DIALOG_CONTENT: Record<DialogChoice, { title: string; description: string }> = {
  collect: {
    title: 'We are here',
    description: `Geo is built on the principle that data should be owned and created by its users in a decentralized and
    verifiable way. The first and most crucial step is to collect data for a wide range of spaces as
    triples/facts, which can then be used to structure meaningful content.`,
  },
  organize: {
    title: 'We are here',
    description: `Geo is built on the principle that data should be owned and created by its users in a decentralized and
    verifiable way. The first and most crucial step is to collect data for a wide range of spaces as
    triples/facts, which can then be used to structure meaningful content.`,
  },
  empower: {
    title: 'We are here',
    description: `Geo is built on the principle that data should be owned and created by its users in a decentralized and
    verifiable way. The first and most crucial step is to collect data for a wide range of spaces as
    triples/facts, which can then be used to structure meaningful content.`,
  },
  solve: {
    title: 'We are here',
    description: `Geo is built on the principle that data should be owned and created by its users in a decentralized and
    verifiable way. The first and most crucial step is to collect data for a wide range of spaces as
    triples/facts, which can then be used to structure meaningful content.`,
  },
};

export function OboardingCarousel() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<DialogChoice>('collect');
  const rowRef = useRef<HTMLDivElement>(null);
  const rowRect = useRect(rowRef.current);

  // There's a hydration bug if the dialog defaults to open on first render in SSR when using
  // a portal. We render the dialog a second after page load to get around it.
  // https://github.com/radix-ui/primitives/issues/1386
  useEffect(() => {
    setTimeout(() => setDialogOpen(true), 100);
  }, []);

  const rowLeft = rowRect?.left ?? 0;
  const rowTop = (rowRect?.top ?? 0) + (rowRect?.height ?? 0);

  return (
    <Row ref={rowRef}>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent left={rowLeft} top={rowTop}>
          <Text variant="mediumTitle">{DIALOG_CONTENT[step].title}</Text>
          <Spacer height={4} />
          <Text>{DIALOG_CONTENT[step].description}</Text>
        </DialogContent>
      </Dialog>

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
