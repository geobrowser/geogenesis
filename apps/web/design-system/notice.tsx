import * as React from 'react';

import { Spacer } from './spacer';
import { Text } from './text';

type Props = {
  visual?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  backgroundLayers?: React.ReactNode;
};

export function Notice({ visual, title, description, action, footer, backgroundLayers }: Props) {
  return (
    <>
      {backgroundLayers}
      <div className="relative z-10 flex min-h-[75vh] flex-col items-center justify-center">
        <div className="flex max-w-md flex-col items-center px-6 text-center">
          {visual ? (
            <>
              {visual}
              <Spacer height={24} />
            </>
          ) : null}
          <Text as="h1" variant="largeTitle">
            {title}
          </Text>
          {description ? (
            <>
              <Spacer height={8} />
              <Text as="p" variant="body" color="grey-04">
                {description}
              </Text>
            </>
          ) : null}
          {action ? (
            <>
              <Spacer height={16} />
              {action}
            </>
          ) : null}
          {footer ? (
            <>
              <Spacer height={16} />
              {footer}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
