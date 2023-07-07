import * as React from 'react';

import { Close } from '~/modules/design-system/icons/close';
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
import { Upload } from '~/modules/design-system/icons/upload';
import { History } from './icons/history';
import { EditorH1 } from './icons/editor-h1';
import { EditorH2 } from './icons/editor-h2';
import { EditorH3 } from './icons/editor-h3';
import { EditorImage } from './icons/editor-image';
import { EditorTable } from './icons/editor-table';
import { EditorText } from './icons/editor-text';
import { EditorList } from './icons/editor-list';
import { Image } from './icons/image';
import { Plus } from './icons/plus';
import type { ColorName } from '~/modules/design-system/theme/colors';
import { Context } from './icons/context';
import { FilterTable } from './icons/filter-table';
import { ChevronDownSmall } from './icons/chevron-down-small';
import { CheckCloseSmall } from './icons/check-close-small';
import { FilterTableWithFilters } from './icons/filter-table-with-filters';
import { Dash } from './icons/dash';
import { Cog } from './icons/cog';
import { NewTab } from './icons/new-tab';
import { Date } from './icons/date';
import { Minus } from './icons/minus';
import { Url } from './icons/url';
import { Wallet } from './icons/wallet';
import { DisconnectWallet } from './icons/disconnect-wallet';

export type IconName =
  | 'blank'
  | 'create'
  | 'createSmall'
  | 'publish'
  | 'close'
  | 'eye'
  | 'expand'
  | 'entity'
  | 'expandSmall'
  | 'upload'
  | 'contractSmall'
  | 'filter'
  | 'trash'
  | 'tick'
  | 'facts'
  | 'copy'
  | 'preset'
  | 'relation'
  | 'plus'
  | 'string'
  | 'image'
  | 'text'
  | 'rightArrowLongSmall'
  | 'chevronDownSmall'
  | 'search'
  | 'history'
  | 'editorH1'
  | 'editorH2'
  | 'editorH3'
  | 'editorText'
  | 'editorList'
  | 'editorImage'
  | 'editorTable'
  | 'context'
  | 'filterTable'
  | 'date'
  | 'filterTableWithFilters'
  | 'checkCloseSmall'
  | 'dash'
  | 'cog'
  | 'newTab'
  | 'minus'
  | 'url'
  | 'wallet'
  | 'disconnectWallet';

type IconProps = React.ComponentPropsWithoutRef<'svg'> & {
  icon: IconName;
  color?: ColorName;
};

export const Icon = ({ icon, ...rest }: IconProps) => {
  const Component = icons[icon];

  return <Component {...rest} />;
};

const Blank = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" />;

const icons: Record<IconName, React.ElementType> = {
  blank: Blank,
  create: Create,
  createSmall: CreateSmall,
  close: Close,
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
  entity: Relation,
  relation: Relation,
  text: Text,
  plus: Plus,
  rightArrowLongSmall: RightArrowLongSmall,
  search: Search,
  history: History,
  editorH1: EditorH1,
  editorH2: EditorH2,
  editorH3: EditorH3,
  editorImage: EditorImage,
  editorTable: EditorTable,
  editorText: EditorText,
  editorList: EditorList,
  string: Text,
  image: Image,
  upload: Upload,
  context: Context,
  filterTable: FilterTable,
  date: Date,
  filterTableWithFilters: FilterTableWithFilters,
  chevronDownSmall: ChevronDownSmall,
  checkCloseSmall: CheckCloseSmall,
  dash: Dash,
  cog: Cog,
  newTab: NewTab,
  minus: Minus,
  url: Url,
  wallet: Wallet,
  disconnectWallet: DisconnectWallet,
};
