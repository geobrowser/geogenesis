import * as React from 'react';

import { Close } from '~/design-system/icons/close';
import { ContractSmall } from '~/design-system/icons/contract-small';
import { Copy } from '~/design-system/icons/copy';
import { Create } from '~/design-system/icons/create';
import { CreateSmall } from '~/design-system/icons/create-small';
import { Expand } from '~/design-system/icons/expand';
import { ExpandSmall } from '~/design-system/icons/expand-small';
import { Eye } from '~/design-system/icons/eye';
import { Facts } from '~/design-system/icons/facts';
import { Filter } from '~/design-system/icons/filter';
import { Preset } from '~/design-system/icons/preset';
import { Publish } from '~/design-system/icons/publish';
import { Relation } from '~/design-system/icons/relation';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { Search } from '~/design-system/icons/search';
import { Text } from '~/design-system/icons/text';
import { Tick } from '~/design-system/icons/tick';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';
import type { ColorName } from '~/design-system/theme/colors';

import { BulkEdit } from './icons/bulk-edit';
import { CheckCircle } from './icons/check-circle';
import { CheckCircleSmall } from './icons/check-circle-small';
import { CheckClose } from './icons/check-close';
import { CheckCloseSmall } from './icons/check-close-small';
import { ChevronDownSmall } from './icons/chevron-down-small';
import { CogSmall } from './icons/cog-small';
import { Context } from './icons/context';
import { Dash } from './icons/dash';
import { Date } from './icons/date';
import { DisconnectWallet } from './icons/disconnect-wallet';
import { EditorH1 } from './icons/editor-h1';
import { EditorH2 } from './icons/editor-h2';
import { EditorH3 } from './icons/editor-h3';
import { EditorImage } from './icons/editor-image';
import { EditorList } from './icons/editor-list';
import { EditorTable } from './icons/editor-table';
import { EditorText } from './icons/editor-text';
import { EyeSmall } from './icons/eye-small';
import { FilterTable } from './icons/filter-table';
import { FilterTableWithFilters } from './icons/filter-table-with-filters';
import { History } from './icons/history';
import { Image } from './icons/image';
import { Member } from './icons/member';
import { Minus } from './icons/minus';
import { MoveSpace } from './icons/move-space';
import { NewTab } from './icons/new-tab';
import { Plus } from './icons/plus';
import { RetrySmall } from './icons/retry-small';
import { Url } from './icons/url';
import { Wallet } from './icons/wallet';

export type IconName =
  | 'blank'
  | 'create'
  | 'createSmall'
  | 'publish'
  | 'close'
  | 'eye'
  | 'eyeSmall'
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
  | 'cogSmall'
  | 'newTab'
  | 'minus'
  | 'url'
  | 'wallet'
  | 'disconnectWallet'
  | 'bulkEdit'
  | 'member'
  | 'moveSpace'
  | 'checkCircleSmall'
  | 'checkCircle'
  | 'checkClose'
  | 'retrySmall';

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
  bulkEdit: BulkEdit,
  create: Create,
  createSmall: CreateSmall,
  close: Close,
  publish: Publish,
  eye: Eye,
  eyeSmall: EyeSmall,
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
  cogSmall: CogSmall,
  newTab: NewTab,
  minus: Minus,
  url: Url,
  wallet: Wallet,
  disconnectWallet: DisconnectWallet,
  member: Member,
  moveSpace: MoveSpace,
  checkCircleSmall: CheckCircleSmall,
  checkCircle: CheckCircle,
  checkClose: CheckClose,
  retrySmall: RetrySmall,
};
