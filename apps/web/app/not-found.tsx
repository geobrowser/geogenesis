import Link from 'next/link';

import * as React from 'react';

import { Button } from '~/design-system/button';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

export default function Custom404() {
  return (
    <div className="relative flex min-h-[75vh] flex-col items-center justify-center">
      <div className="z-10 flex flex-col items-center">
        <img src="/404.svg" alt="Image of a 404 error." />
        <Spacer height={24} />
        <Text as="h1" variant="bodySemibold">
          This page could not be found :-(
        </Text>
        <Spacer height={16} />
        <Button>
          <Link href="/spaces">
            <Text variant="button" color="white">
              Go to all spaces
            </Text>
          </Link>
        </Button>
      </div>
      <img
        src="/405.svg"
        style={{ position: 'absolute', opacity: 1, zIndex: 5 }}
        alt="Background image of a 404 error"
      />
      <img
        src="/406.svg"
        style={{ position: 'absolute', opacity: 1, zIndex: 4 }}
        alt="Background image of a 404 error"
      />
      <img
        src="/407.svg"
        style={{ position: 'absolute', opacity: 1, zIndex: 3 }}
        alt="Background image of a 404 error"
      />
    </div>
  );
}
