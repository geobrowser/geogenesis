'use client';

import { motion } from 'framer-motion';

import * as React from 'react';

import { Relation, Value } from '~/core/types';

import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';

interface Props {
  id: string;
  spaceId: string;
  values: Value[];
  relations: Relation[];
  referencedByComponent: React.ReactNode;
}

export function ProfilePageComponent(props: Props) {
  return (
    <>
      <motion.div key="entity-page-entity-editor" layout="position">
        <Editor
          spaceId={props.spaceId}
          placeholder={
            <motion.p layout="position" className="text-body text-grey-04">
              There is no overview here yet.
            </motion.p>
          }
        />
      </motion.div>

      <Spacer height={40} />
      <motion.div key="entity-page-entity-attributes" layout="position">
        <ToggleEntityPage id={props.id} spaceId={props.spaceId} />
      </motion.div>
      <Spacer height={40} />
      {props.referencedByComponent}
    </>
  );
}
