import * as React from 'react';

import { ContractSmall } from '~/modules/design-system/icons/contract-small';
import { Copy } from '~/modules/design-system/icons/copy';
import { Create } from '~/modules/design-system/icons/create';
import { CreateSmall } from '~/modules/design-system/icons/create-small';
import { Expand } from '~/modules/design-system/icons/expand';
import { ExpandSmall } from '~/modules/design-system/icons/expand-small';
import { Eye } from '~/modules/design-system/icons/eye';
import { Facts } from '~/modules/design-system/icons/facts';
import { Filter } from '~/modules/design-system/icons/filter';
import { Preset } from '~/modules/design-system/icons/preset';
import { Publish } from '~/modules/design-system/icons/publish';
import { Relation } from '~/modules/design-system/icons/relation';
import { RightArrowLongSmall } from '~/modules/design-system/icons/right-arrow-long-small';
import { Search } from '~/modules/design-system/icons/search';
import { Text } from '~/modules/design-system/icons/text';
import { Tick } from '~/modules/design-system/icons/tick';
import { Trash } from '~/modules/design-system/icons/trash';
import type { ColorName } from '~/modules/design-system/theme/colors';

export type IconName =
  | 'create'
  | 'createSmall'
  | 'publish'
  | 'eye'
  | 'expand'
  | 'expandSmall'
  | 'contractSmall'
  | 'filter'
  | 'trash'
  | 'tick'
  | 'facts'
  | 'copy'
  | 'preset'
  | 'relation'
  | 'text'
  | 'rightArrowLongSmall'
  | 'search';

type IconProps = React.ComponentPropsWithoutRef<'svg'> & {
  icon: IconName;
  color?: ColorName;
};

export const Icon = ({ icon, ...rest }: IconProps) => {
  const Component = icons[icon];

  return <Component {...rest} />;
};

const icons: Record<IconName, React.ElementType> = {
  create: Create,
  createSmall: CreateSmall,
  publish: Publish,
  eye: Eye,
  expand: Expand,
  expandSmall: ExpandSmall,
  contractSmall: ContractSmall,
  filter: Filter,
  trash: Trash,
  tick: Tick,
  facts: Facts,
  copy: Copy,
  preset: Preset,
  relation: Relation,
  text: Text,
  rightArrowLongSmall: RightArrowLongSmall,
  search: Search,
};
