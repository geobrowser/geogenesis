export type MutationStatus = 'idle' | 'pending' | 'success' | 'error';

export type MutationStatusLabels = {
  idle: string;
  pending: string;
  success: string;
  /** Defaults to "Try again", which every governance row button uses. */
  error?: string;
};

/** The button text for a mutation's status, shared by the members/editors governance rows. */
export function mutationStatusLabel(status: MutationStatus, labels: MutationStatusLabels): string {
  if (status === 'error') return labels.error ?? 'Try again';
  return labels[status];
}
