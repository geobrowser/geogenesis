'use client';

import * as Sentry from '@sentry/nextjs';

import * as React from 'react';

import { Button } from '~/design-system/button';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function SpaceError({ error, reset }: ErrorProps) {
  React.useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <div className="relative flex min-h-[75vh] flex-col items-center justify-center">
      <div className="z-10 flex flex-col items-center">
        <Text as="h1" variant="bodySemibold">
          Could not load this space
        </Text>
        <Spacer height={8} />
        <Text as="p" variant="body" color="grey-04">
          Something went wrong while loading this space. Please try again.
        </Text>
        <Spacer height={16} />
        <Button onClick={reset}>
          <Text variant="button" color="white">
            Try again
          </Text>
        </Button>
      </div>
    </div>
  );
}
