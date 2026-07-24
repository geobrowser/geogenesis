'use client';

import * as Dialog from '@radix-ui/react-dialog';

import * as React from 'react';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { useProposeVotingSettings } from '~/core/hooks/use-propose-voting-settings';
import { describeError } from '~/core/utils/error-diagnostics';

import { Button, SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Time } from '~/design-system/icons/time';
import { Menu, MenuItem } from '~/design-system/menu';
import { Pending } from '~/design-system/pending';

import { VotingSettingsFields } from './voting-settings-fields';
import {
  type VotingSettingsSnapshot,
  parseVotingSettingsForm,
  snapshotToFormState,
  snapshotToHidden,
  votingSettingsWarnings,
} from './voting-settings';

type Props = {
  spaceId: string;
  daoSpaceAddress: string;
  /** Current on-chain settings, used to prefill the form and preserve hidden fields. */
  snapshot: VotingSettingsSnapshot;
};

/**
 * Editor-only affordance on the governance page. Opens the "Edit space governance" modal
 * and, on submit, creates a SLOW-path proposal to update the space's voting settings.
 */
export function EditGovernanceSettings({ spaceId, daoSpaceAddress, snapshot }: Props) {
  const { isEditor } = useAccessControl(spaceId);
  const { propose, isPending } = useProposeVotingSettings();

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState(() => snapshotToFormState(snapshot));
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hidden = React.useMemo(() => snapshotToHidden(snapshot), [snapshot]);

  // Reset the form to the current on-chain values every time the modal opens, so a
  // dismissed edit doesn't leave stale input behind on the next open.
  React.useEffect(() => {
    if (open) {
      setState(snapshotToFormState(snapshot));
      setSubmitted(false);
      setError(null);
    }
  }, [open, snapshot]);

  if (!isEditor) {
    return null;
  }

  const parsed = parseVotingSettingsForm(state, hidden);
  const warnings = parsed.kind === 'ok' ? votingSettingsWarnings(state) : [];

  const handleSubmit = async () => {
    if (parsed.kind !== 'ok' || isPending) return;
    setError(null);
    try {
      await propose({ spaceId, daoSpaceAddress: daoSpaceAddress as `0x${string}`, votingSettings: parsed.value });
      setSubmitted(true);
      window.setTimeout(() => setOpen(false), 2500);
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <>
      <Menu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        trigger={menuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}
        className="max-w-[220px]"
      >
        <MenuItem
          onClick={() => {
            setMenuOpen(false);
            setOpen(true);
          }}
        >
          <p>Edit space governance</p>
        </MenuItem>
      </Menu>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-100 bg-text/30" />
        <Dialog.Content className="fixed inset-0 z-101 flex items-center justify-center focus:outline-none">
          <div className="flex w-full max-w-[360px] flex-col overflow-hidden rounded-2xl border border-grey-02 bg-white shadow-dropdown">
            <div className="flex items-center justify-between p-4">
              <Dialog.Title className="text-smallTitle">Edit space governance</Dialog.Title>
              <Dialog.Close asChild>
                <SquareButton icon={<Close color="grey-04" />} className="border-none! bg-transparent!" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Propose new voting settings for this space. Changes go through a governance vote.
            </Dialog.Description>

            {submitted ? (
              <div className="px-4 pb-6 text-center">
                <p className="text-quoteMedium">Proposal submitted</p>
                <p className="pt-1 text-metadata text-grey-04">
                  Editors can now vote on your governance change on the review path.
                </p>
              </div>
            ) : (
              <>
                <div className="px-4">
                  <div className="mb-4 h-px w-full bg-divider" />
                  <VotingSettingsFields state={state} onChange={setState} disabled={isPending} />
                  {parsed.kind === 'error' && (
                    <div className="mt-4 rounded bg-errorTertiary px-3 py-2 text-metadataMedium text-red-01">
                      {parsed.message}
                    </div>
                  )}
                  {warnings.map(warning => (
                    <div
                      key={warning}
                      className="mt-4 rounded border border-orange px-3 py-2 text-metadataMedium text-orange"
                    >
                      {warning}
                    </div>
                  ))}
                  {error && (
                    <div className="mt-4 rounded bg-errorTertiary px-3 py-2 text-metadataMedium text-red-01">{error}</div>
                  )}
                </div>
                <div className="flex flex-col gap-3 p-4">
                  {/* Governance-settings changes are review-path only at the contract level
                      (SDK's proposeUpdateVotingSettings rejects FAST). Show it explicitly so
                      the modal matches the ProposalPathSelector affordance elsewhere. */}
                  <div className="flex items-center justify-end gap-1.5 text-metadata text-grey-04">
                    <Time />
                    <span>Review path</span>
                  </div>
                  <Button
                    variant="primary"
                    onClick={handleSubmit}
                    disabled={parsed.kind !== 'ok' || isPending}
                    className="w-full"
                  >
                    <Pending isPending={isPending}>Propose changes</Pending>
                  </Button>
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
