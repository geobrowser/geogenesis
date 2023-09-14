'use client';

import { motion } from 'framer-motion';

import * as React from 'react';

import { Triple } from '~/core/types';

import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';

interface Props {
  id: string;
  spaceId: string;
  triples: Triple[];
}

export function ProfilePageComponent(props: Props) {
  return (
    <>
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
        <ToggleEntityPage id={props.id} spaceId={props.id} triples={props.triples} />
      </motion.div>
    </>
  );
}
