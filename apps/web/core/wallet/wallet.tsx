'use client';

import { Button, PILL_BUTTON_CLASS_NAME } from '~/design-system/button';

import { usePrepareOnboarding } from '../hooks/use-prepare-onboarding';
import { useTrackedLogin } from '../hooks/use-tracked-login';
import { saveVotesNavLabel } from '../save-votes-copy';
import { useLocalVoteCount } from '../state/local-votes';
import { openSaveVotesPrompt } from '../state/save-votes-prompt';

function PrivyConnectButton() {
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
      openSaveVotesPrompt('navbar');
      return;
    }
    prepareOnboarding({ returnTo: null });
    login({ component: 'navbar', auth_control: 'sign_in', auth_intent: 'sign_in' });
  };

  return (
    <Button variant="primary" className={PILL_BUTTON_CLASS_NAME} onClick={onLogin}>
      {localVoteCount === 0 ? 'Log in' : saveVotesNavLabel(localVoteCount)}
    </Button>
  );
}

export function GeoConnectButton() {
  return <PrivyConnectButton />;
}
