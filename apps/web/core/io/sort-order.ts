export const SortOrder = {
  Asc: 'ASC',
  Desc: 'DESC',
} as const;

export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];
