'use client';

import cx from 'classnames';

import {
  Button,
  COMPACT_PILL_CLASS_NAME,
  COMPACT_PILL_TARGET_CLASS_NAME,
  PILL_BUTTON_CLASS_NAME,
} from '~/design-system/button';

import { usePrepareOnboarding } from '../hooks/use-prepare-onboarding';
import { useTrackedLogin } from '../hooks/use-tracked-login';
import { saveVotesNavLabel } from '../save-votes-copy';
import { useLocalVoteCount } from '../state/local-votes';
import { type SaveVotesPressReason, openSaveVotesPrompt } from '../state/save-votes-prompt';

type ConnectButtonProps = {
  /** The debate feed's phone bar (GEO-3415): the smaller pill, in a full 44px target. */
  compact?: boolean;
  /** Where the sign-in was started, for its analytics, and the save sheet's reason when votes wait. */
  component?: SaveVotesPressReason;
};

function PrivyConnectButton({ compact = false, component = 'navbar' }: ConnectButtonProps) {
  // `null` rather than the current path: this button is a sign-in from anywhere in the app, not a
  // return to anywhere in particular, and a stale path here would send the next person somewhere
  // they never were.
  const prepareOnboarding = usePrepareOnboarding();

  const { login } = useTrackedLogin({});
  // With votes waiting on this device, this is a save prompt (GEO-3214): it names them, and opens
  // the save sheet centred rather than Privy's own dialog, so the votes are in front of the visitor
  // as they sign in (GEO-3400). The sheet's sign-ins save them.
  const localVoteCount = useLocalVoteCount();

  const onLogin = () => {
    if (localVoteCount > 0) {
      openSaveVotesPrompt(component);
      return;
    }
    prepareOnboarding({ returnTo: null });
    login({ component, auth_control: 'sign_in', auth_intent: 'sign_in' });
  };

  const label = localVoteCount === 0 ? 'Log in' : saveVotesNavLabel(localVoteCount);

  if (compact) {
    return (
      <button type="button" onClick={onLogin} className={cx(COMPACT_PILL_TARGET_CLASS_NAME, 'px-2')}>
        <span className={cx(COMPACT_PILL_CLASS_NAME, 'bg-[#151515] px-2 text-white')}>{label}</span>
      </button>
    );
  }

  return (
    <Button variant="primary" className={PILL_BUTTON_CLASS_NAME} onClick={onLogin}>
      {label}
    </Button>
  );
}

export function GeoConnectButton(props: ConnectButtonProps) {
  return <PrivyConnectButton {...props} />;
}
