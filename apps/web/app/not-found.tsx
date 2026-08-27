import * as React from 'react';

import { NavUtils } from '~/core/utils/utils';

import { Button } from '~/design-system/button';
import { Notice } from '~/design-system/notice';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

export default function Custom404() {
  return (
    <Notice
      visual={<img src="/404.svg" alt="Image of a 404 error." />}
      title="This page could not be found :-("
      action={
        <Button>
          <Link href={NavUtils.toRoot()}>
            <Text variant="button" color="white">
              Go to root space
            </Text>
          </Link>
        </Button>
      }
      backgroundLayers={
        <>
          <img
            src="/405.svg"
            style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', maxWidth: 'none', zIndex: 5 }}
            alt="Background image of a 404 error"
          />
          <img
            src="/406.svg"
            style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', maxWidth: 'none', zIndex: 4 }}
            alt="Background image of a 404 error"
          />
          <img
            src="/407.svg"
            style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', maxWidth: 'none', zIndex: 3 }}
            alt="Background image of a 404 error"
          />
        </>
      }
    />
  );
}
