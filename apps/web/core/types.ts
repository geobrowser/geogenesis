export type Dictionary<K extends string, T> = Partial<Record<K, T>>;
export type OmitStrict<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type Profile = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  profileLink: string | null;
  address: `0x${string}`;
};

export type AppEnv = 'development' | 'testnet' | 'production';

export type RelationValueType = {
  typeId: string;
  typeName: string | null;
  spaceIdOfAttribute?: string;
};

export type RelationValueTypesByAttributeId = Record<string, Array<RelationValueType>>;

export type SpaceType =
  | 'default'
  | 'company'
  | 'nonprofit'
  | 'personal'
  | 'academic-field'
  | 'region'
  | 'industry'
  | 'protocol'
  | 'dao'
  | 'government-org'
  | 'interest';
export type SpaceGovernanceType = 'PUBLIC' | 'PERSONAL';

export type ReviewState =
  | 'idle'
  | 'reviewing'
  | 'publishing-ipfs'
  | 'signing-wallet'
  | 'publishing-contract'
  | 'publish-complete'
  | 'publish-error';

export type FilterField =
  | 'entity-id'
  | 'entity-name'
  | 'attribute-id'
  | 'attribute-name'
  | 'value'
  | 'linked-to'
  | 'starts-with'
  | 'not-space-id';

export type FilterClause = {
  field: FilterField;
  value: string;
};

export type FilterState = FilterClause[];
