'use client';

import { motion } from 'framer-motion';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { Triple } from '~/core/types';

import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import { EditableEntityPage } from '~/partials/entity-page/editable-entity-page';
import { ReadableEntityPage } from '~/partials/entity-page/readable-entity-page';
import { ReferencedByEntity } from '~/partials/entity-page/types';
import { PersonalSpaceOnboarding } from '~/partials/profile/personal-space-onboarding';

interface Props {
  id: string;
  spaceId: string;
  referencedByEntities: ReferencedByEntity[];
  triples: Triple[];
}

export function ProfilePageComponent(props: Props) {
  // @TODO: Use cookie for this
  const [isOnboardingOpen, setIsOnboardingOpen] = React.useState(true);
  const renderEditablePage = useUserIsEditing(props.id);

  const Page = renderEditablePage ? EditableEntityPage : ReadableEntityPage;

  return (
    <>
      <Editor editable={renderEditablePage} placeholder="There is no overview here yet." />
      {isOnboardingOpen && (
        <>
          <Spacer height={40} />
          <PersonalSpaceOnboarding onDismiss={() => setIsOnboardingOpen(false)} />
        </>
      )}
      <Spacer height={40} />
      <motion.div key="entity-page-entity-attributes" layout="position">
        <Page id={props.id} spaceId={props.id} triples={props.triples} />
      </motion.div>
    </>
  );
}
