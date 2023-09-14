'use client';

import { motion } from 'framer-motion';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { Triple } from '~/core/types';

import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import { EditableEntityPage } from '~/partials/entity-page/editable-entity-page';
import { ReadableEntityPage } from '~/partials/entity-page/readable-entity-page';
import { PersonalSpaceOnboarding } from '~/partials/profile/personal-space-onboarding';

interface Props {
  id: string;
  name: string | null;
  spaceId: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  triples: Triple[];
  onDismissForever?: () => Promise<void>;
  hasDismissedOnboarding: boolean;
}

export function ProfilePageComponent(props: Props) {
  const [isOnboardingOpen, setIsOnboardingOpen] = React.useState(!props.hasDismissedOnboarding);
  const renderEditablePage = useUserIsEditing(props.id);

  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  const onDismissForever = () => {
    // @TODO: Disabling cookie interactions for now until we get later on in the social
    // work. This is so we can test onboarding feedback more frequently.
    // props.onDismissForever();

    setIsOnboardingOpen(false);
  };

  return (
    <>
      {/* @TODO: Only show onboarding if this space is the active user's personal space */}
      {isOnboardingOpen && (
        <>
          <PersonalSpaceOnboarding onDismiss={() => setIsOnboardingOpen(false)} onDismissForever={onDismissForever} />
          <Spacer height={40} />
        </>
      )}
      <motion.div key="entity-page-entity-editor" layout="position">
        <Editor
          placeholder={
            <motion.p layout="position" className="text-body text-grey-04">
              There is no overview here yet.
            </motion.p>
          }
        />
      </motion.div>

      <Spacer height={40} />
      <motion.div key="entity-page-entity-attributes" layout="position">
        <Page id={props.id} spaceId={props.id} triples={props.triples} />
      </motion.div>
    </>
  );
}
