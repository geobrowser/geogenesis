import { SYSTEM_IDS } from '@geogenesis/sdk';

import { AppOp } from '~/core/types';

export function forEntityId(ops: AppOp[], entityId: string) {
  return ops.filter(a => a.entityId === entityId);
}

export const getValue = (op: AppOp, fallback: boolean | string = false): string => {
  let value: string | null = '';

  switch (op.value.type) {
    case 'ENTITY':
    case 'COLLECTION':
    case 'TEXT':
    case 'NUMBER':
    case 'TIME':
    case 'URL':
      value = op.value.value;
      break;
    case 'IMAGE':
      value = op.value.image;
      break;
    case 'CHECKBOX':
      throw new Error('checkbox value not supported');
  }

  return fallback !== false ? value ?? fallback : value;
};

export const getValueType = (op: AppOp) => {
  return op.value.type;
};

export const getName = (op: AppOp) => {
  switch (op.value.type) {
    case 'ENTITY':
      return op.value.name;
    default:
      return null;
  }
};

export const getId = (op: AppOp) => {
  return op.id;
};

export const getBlockType = (action: AppOp) => {
  switch (action.attributeId) {
    case SYSTEM_IDS.TEXT_BLOCK:
      return 'textBlock';
    case SYSTEM_IDS.IMAGE:
    case SYSTEM_IDS.IMAGE_ATTRIBUTE:
    case SYSTEM_IDS.IMAGE_BLOCK:
      return 'imageBlock';
    case SYSTEM_IDS.TABLE_BLOCK:
      return 'tableBlock';
    case SYSTEM_IDS.MARKDOWN_CONTENT:
      return 'markdownContent';
    default:
      return null;
  }
};
