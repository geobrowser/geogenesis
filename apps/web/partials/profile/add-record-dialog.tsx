'use client';

import { Content, Overlay, Portal, Root } from '@radix-ui/react-dialog';

import * as React from 'react';

import { useProfileHistory } from '~/core/hooks/use-profile-history';
import { usePublish } from '~/core/hooks/use-publish';
import type { EducationDraft, PositionDraft } from '~/core/profile/stage-history';
import { useMutate } from '~/core/sync/use-mutate';

import { AddEducationSheet } from './add-education-sheet';
import { AddPositionSheet } from './add-position-sheet';

type Props = {
  kind: 'employment' | 'education' | null;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  spaceId: string;
};

/**
 * One position or degree, added from the profile page rather than the edit
 * modal (GEO-2859).
 *
 * The sheets are the ones #2412 already ships: they take a draft and hand one
 * back, and know nothing about what is around them. Wrapping one in its own
 * dialog is a second call site, not a second component.
 *
 * **It publishes on Done**, which is the one thing that differs. Inside the edit
 * modal a sheet hands its draft up and the modal's Save publishes everything at
 * once; here there is no outer Save to wait for, so Done is the whole edit.
 */
export function AddRecordDialog({ kind, onOpenChange, entityId, spaceId }: Props) {
  const { storage } = useMutate();
  const { makeProposal } = usePublish();
  const history = useProfileHistory({ entityId, spaceId, enabled: kind !== null });
  const [isSaving, setIsSaving] = React.useState(false);

  const publish = React.useCallback(
    async (rows: {
      values: ReturnType<typeof history.stagePending>['values'];
      relations: ReturnType<typeof history.stagePending>['relations'];
    }) => {
      // Written into the store first so the publish layer collects them the way
      // it collects everything else, and so a failure leaves them recoverable
      // rather than lost between a form and a request.
      rows.values.forEach(value => (value.isDeleted ? storage.values.delete(value) : storage.values.set(value)));
      rows.relations.forEach(relation =>
        relation.isDeleted ? storage.relations.delete(relation) : storage.relations.set(relation)
      );

      await makeProposal({
        values: rows.values,
        relations: rows.relations,
        spaceId,
        name: 'Update profile',
        onSuccess: () => {
          history.settle();
          setIsSaving(false);
          onOpenChange(false);
        },
        onError: () => setIsSaving(false),
      });
    },
    [history, makeProposal, onOpenChange, spaceId, storage]
  );

  const save = (draft: PositionDraft | EducationDraft) => {
    setIsSaving(true);

    if ('company' in draft) history.addPosition(draft);
    else history.addEducation(draft);
  };

  // `stagePending` reads the queue the call above just filled, and it only holds
  // the new rows once React has re-rendered with them — so the publish waits a
  // commit rather than reading a queue that is still empty.
  React.useEffect(() => {
    if (!isSaving || !history.hasPendingChanges) return;
    void publish(history.stagePending());
  }, [history, isSaving, publish]);

  const close = () => {
    if (isSaving) return;
    history.discard();
    onOpenChange(false);
  };

  return (
    <Root open={kind !== null} onOpenChange={next => (next ? onOpenChange(true) : close())}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />
        <Content className="fixed inset-0 z-101 flex items-start justify-center overflow-y-auto focus:outline-hidden">
          <div className="my-10 flex w-full max-w-[560px] flex-col rounded-lg border border-grey-02 bg-white shadow-dropdown">
            {kind === 'employment' ? (
              <AddPositionSheet spaceId={spaceId} onCancel={close} onSave={save} />
            ) : kind === 'education' ? (
              <AddEducationSheet spaceId={spaceId} onCancel={close} onSave={save} />
            ) : null}
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
