import styled from '@emotion/styled';
import { Command } from 'cmdk';
import { Entity } from '~/modules/types';

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
  maxWidth: 434,
  backgroundColor: props.theme.colors.white,
  borderRadius: props.theme.radius,
  overflow: 'hidden',
  border: `1px solid ${props.theme.colors['grey-02']}`,
  boxShadow: props.theme.shadows.dropdown,
}));

export function OnboardingDialog({ onDone, open, onOpenChange }: Props) {
  return (
    <DialogContainer open={open} onOpenChange={onOpenChange} label="Entity search">
      Hello World
      <div className="flex justify-between">
        <button onClick={() => onDone({ id: '1', name: 'Hello' })}>Done</button>
        <div className="font-semibold">Profile Creation</div>
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    </DialogContainer>
  );
}
