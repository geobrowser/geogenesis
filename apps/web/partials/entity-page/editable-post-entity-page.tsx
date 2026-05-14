'use client';

import { motion } from 'framer-motion';

import { Accordion } from '~/design-system/accordion';
import { Text } from '~/design-system/text';

import { EditableEntityProperties } from '~/partials/entity-page/editable-entity-page';

type EditablePostEntityPageProps = {
  id: string;
  spaceId: string;
};

export function EditablePostEntityPage({ id, spaceId }: EditablePostEntityPageProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="relative rounded-lg border border-grey-02 shadow-button"
    >
      <Accordion type="single" defaultValue="post-information" collapsible className="w-full">
        <Accordion.Item value="post-information" className="border-none">
          <Accordion.Trigger className="px-5 py-4">
            <Text as="span" variant="body">
              Post information
            </Text>
          </Accordion.Trigger>
          <Accordion.Content className="border-t border-grey-02 px-0 pt-0 [&>div]:pb-5">
            <EditableEntityProperties id={id} spaceId={spaceId} />
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>
    </motion.div>
  );
}
