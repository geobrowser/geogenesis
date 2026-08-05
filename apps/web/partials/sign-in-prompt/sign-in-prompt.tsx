'use client';

import { useGeoLogin } from '@geogenesis/auth';
import { Content, Description, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import { useSetAtom } from 'jotai';

import { trackPrivyAuth } from '~/core/analytics';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { type SignInPromptAction, useSignInPrompt } from '~/core/state/sign-in-prompt-store';

import { Button, SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

import { avatarAtom, nameAtom, spaceIdAtom, stepAtom, topicIdAtom } from '~/partials/onboarding/dialog';

const COPY: Record<SignInPromptAction, { title: string }> = {
  vote: { title: 'Create your personal space to vote on entities' },
  join: { title: 'Create your personal space to join spaces' },
  comment: { title: 'Create your personal space to comment' },
};

const BODY = 'A personal space lets you vote, comment, join spaces, and more.';

export function SignInPrompt() {
  const { action, close } = useSignInPrompt();
  const { smartAccount } = useSmartAccount();

  const setName = useSetAtom(nameAtom);
  const setTopicId = useSetAtom(topicIdAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const setStep = useSetAtom(stepAtom);

  const { login } = useGeoLogin({
    onComplete: args => trackPrivyAuth(args, { auth_flow: 'manual_login' }),
  });

  // Close once the wallet is connected — useOnboarding takes over and shows the
  // onboarding dialog if the user has no personal space yet.
  React.useEffect(() => {
    if (smartAccount && action !== null) {
      close();
    }
  }, [smartAccount, action, close]);

  if (action === null) return null;

  const { title } = COPY[action];

  const handleSignIn = () => {
    // Same reset the navbar's GeoConnectButton runs — clears any in-progress
    // onboarding state before launching Privy.
    setName('');
    setTopicId('');
    setAvatar('');
    setSpaceId('');
    setStep('start');
    close();
    login();
  };

  return (
    <Root open onOpenChange={open => !open && close()}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />
        <Content className="fixed inset-0 z-1000 flex h-full w-full items-start justify-center focus:outline-hidden">
          <div className="pointer-events-auto relative mt-40 flex w-full max-w-[360px] flex-col gap-4 rounded-lg border border-grey-02 bg-white p-4 shadow-dropdown">
            <div className="absolute top-3 right-3">
              <SquareButton onClick={close} icon={<Close />} />
            </div>
            <div className="space-y-2 px-2 pt-6">
              <Title asChild>
                <Text as="h3" variant="bodySemibold" className="text-center text-2xl!">
                  {title}
                </Text>
              </Title>
              <Description asChild>
                <Text as="p" variant="body" className="text-center text-base!">
                  {BODY}
                </Text>
              </Description>
            </div>
            <Button onClick={handleSignIn} className="w-full">
              Sign up
            </Button>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
