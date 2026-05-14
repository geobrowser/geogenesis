'use client';

import { Accordion } from '~/design-system/accordion';
import { Text } from '~/design-system/text';

import { ReadableEntityProperties, useReadableEntityHasContent } from '~/partials/entity-page/readable-entity-page';

type Props = {
  id: string;
  spaceId: string;
};

export function ReadablePostEntityPage({ id, spaceId }: Props) {
  const hasContent = useReadableEntityHasContent(id, spaceId);

  if (!hasContent) {
    return null;
  }

  return (
    <div className="rounded-lg border border-grey-02 shadow-button">
      <Accordion type="single" defaultValue="post-information" collapsible className="w-full">
        <Accordion.Item value="post-information" className="border-none">
          <Accordion.Trigger className="px-5 py-4">
            <Text as="span" variant="body">
              Post information
            </Text>
          </Accordion.Trigger>
          <Accordion.Content className="border-t border-grey-02 px-0 pt-0 [&>div]:pb-0">
            <div className="flex flex-col gap-6 px-5 pb-5 pt-0">
              <ReadableEntityProperties id={id} spaceId={spaceId} />
            </div>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}
