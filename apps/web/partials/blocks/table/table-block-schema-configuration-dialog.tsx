import { Content, Overlay, Portal, Root, Trigger } from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';

import * as React from 'react';

import { FilteredTableView } from '~/design-system/icons/filtered-table-view';

const MotionContent = motion(Content);
const MotionOverlay = motion(Overlay);

interface Props {
  content: React.ReactNode;
}

export function TableBlockSchemaConfigurationDialog(props: Props) {
  return (
    <Root>
      <Trigger asChild>
        <button className="inline-flex w-full items-center gap-2 px-3 py-2 text-grey-04 transition-colors duration-75 hover:bg-bg hover:text-text">
          <FilteredTableView />
          <span className="text-button">Edit type schema</span>
        </button>
      </Trigger>

      <Portal>
        <MotionOverlay
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.2 }}
          transition={{ type: 'tween', ease: 'easeInOut', duration: 0.15, opacity: { duration: 0.1 } }}
          className="fixed inset-0 z-100 bg-text"
        />

        <MotionContent
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'tween', ease: 'easeInOut', duration: 0.15, opacity: { duration: 0.1 } }}
          className="fixed inset-0 top-[25%] z-100 mx-auto h-[484px] max-w-[376px] overflow-hidden overflow-y-auto rounded bg-white focus:outline-none"
        >
          {props.content}
        </MotionContent>
      </Portal>
    </Root>
  );
}
