'use client';

import cx from 'classnames';

import {
  Button,
  COMPACT_PILL_CLASS_NAME,
  COMPACT_PILL_TARGET_CLASS_NAME,
  PILL_BUTTON_CLASS_NAME,
} from '~/design-system/button';

import { usePrepareOnboarding } from '../hooks/use-prepare-onboarding';
import { useSaveVotesSignIn } from '../hooks/use-save-votes-sign-in';
import { useTrackedLogin } from '../hooks/use-tracked-login';
import { saveVotesNavLabel } from '../save-votes-copy';
import { useLocalVoteCount } from '../state/local-votes';

type ConnectButtonProps = {
  /** The debate feed's phone bar (GEO-3415): the smaller pill, in a full 44px target. */
  compact?: boolean;
  /** Where the sign-in was started, for its analytics. */
  component?: string;
};

function PrivyConnectButton({ compact = false, component = 'navbar' }: ConnectButtonProps) {
  // `null` rather than the current path: this button is a sign-in from anywhere in the app, not a
  // return to anywhere in particular, and a stale path here would send the next person somewhere
  // they never were.
  const prepareOnboarding = usePrepareOnboarding();

  const { login } = useTrackedLogin({});
  // With votes waiting on this device, this is a save prompt (GEO-3214): it names them, and the
  // sign-in it starts saves them. Returns to this page, since the votes were cast here.
  const localVoteCount = useLocalVoteCount();
  const saveSignIn = useSaveVotesSignIn();

  const onLogin = () => {
    if (localVoteCount > 0) {
      void saveSignIn(component, localVoteCount);
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
