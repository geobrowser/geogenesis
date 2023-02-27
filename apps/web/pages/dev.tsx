import * as React from 'react';
import Link from 'next/link';
import { ConnectKitButton } from 'connectkit';

import { Input } from '~/modules/design-system/input';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { colors } from '~/modules/design-system/theme/colors';
import { typography, TypographyName } from '~/modules/design-system/theme/typography';

const Colors = Object.entries(colors.light).map(([name, color]) => {
  return (
    <div key={name}>
      <div className="h-[150px] w-[150px] rounded" style={{ backgroundColor: color }} />
      <Spacer height={8} />
      <Text variant="bodySemibold">{name}</Text>
      <Text>{color}</Text>
    </div>
  );
});

const Typography = Object.keys(typography.light).map((name, index) => {
  return (
    <Text key={index} variant={name as TypographyName}>
      {name}
    </Text>
  );
});

export default function Dev() {
  return (
    <>
      <Link href="/dev">
        <a>Design system</a>
      </Link>
      <Spacer width={4} />
      <Link href="/spaces">
        <a>Spaces</a>
      </Link>
      <ConnectKitButton />
      <div className="flex flex-col flex-wrap gap-[12px]">
        <div className="flex flex-wrap gap-[25px]">
          <Text variant="mediumTitle">Colors</Text>
          <Spacer height={12} />
          <div className="flex flex-wrap gap-[25px]">{Colors}</div>
        </div>
        <Spacer height={32} />
        <div className="flex flex-col flex-wrap gap-[12px]">
          <Text variant="mediumTitle">Typography</Text>
          <div className="flex flex-col flex-wrap gap-[12px]">{Typography}</div>
        </div>
        <Spacer height={32} />
        <div className="flex flex-col flex-wrap gap-[12px]">
          <Text variant="mediumTitle">Inputs</Text>
          <Spacer height={12} />
          <Input placeholder="Placeholder..." />
          <Spacer height={6} />
          <Input placeholder="Disabled :(" disabled />
        </div>
      </div>
    </>
  );
}
