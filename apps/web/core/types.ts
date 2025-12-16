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

export type TabEntity = {
  id: string;
  name: string | null;
};
