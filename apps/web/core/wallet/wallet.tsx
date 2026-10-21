'use client';

import { Button, PILL_BUTTON_CLASS_NAME } from '~/design-system/button';

import { usePrepareOnboarding } from '../hooks/use-prepare-onboarding';
import { useSaveVotesSignIn } from '../hooks/use-save-votes-sign-in';
import { useTrackedLogin } from '../hooks/use-tracked-login';
import { saveVotesNavLabel } from '../save-votes-copy';
import { useLocalVoteCount } from '../state/local-votes';

/**
 * `compact`: the debate feed's phone bar (GEO-3415). The pill draws smaller than the navbar's, 22px
 * against 28, but the button around it is a full 44px target; the visible size is what was asked to
 * shrink, not the thing a thumb has to hit.
 */
type ConnectButtonProps = { compact?: boolean; component?: string };

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
      <button
        type="button"
        onClick={onLogin}
        className="group -mx-2 flex h-11 min-w-11 shrink-0 items-center justify-center px-2 focus-visible:outline-none"
      >
        <span className="flex h-[22px] items-center rounded-full bg-[#151515] px-2 text-[13px] leading-none tracking-[-0.2px] whitespace-nowrap text-white group-focus-visible:ring-2 group-focus-visible:ring-text group-focus-visible:ring-offset-2">
          {label}
        </span>
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
