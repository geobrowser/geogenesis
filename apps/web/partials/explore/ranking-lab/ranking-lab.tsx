'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import { getGeoChatSession } from '~/core/debates/api';
import { useGeoChatAuth } from '~/core/debates/hooks';
import { DEFAULT_EXPLORE_TYPE_IDS, EXPLORE_ENTITY_TYPES } from '~/core/explore/explore-constants';
import type { FreshSlotConfig } from '~/core/explore/fresh-slot/fresh-slot-config';
import type { FreshSlotHistoryEntry, FreshSlotState } from '~/core/explore/fresh-slot/fresh-slot-store';
import {
  GEO_CHAT_AUTHORIZATION_HEADER,
  type RankingLabPreviewItem,
  type RankingLabPreviewResponse,
} from '~/core/explore/fresh-slot/ranking-lab-types';
import type { RankingParams } from '~/core/explore/fresh-slot/ranking-params';
import type { SeenDemotionConfig } from '~/core/explore/seen-demotion/seen-demotion-config';

import { Button } from '~/design-system/button';
import { Text } from '~/design-system/text';

/**
 * The ranking lab (GEO-3221, phase 1): Best's fresh slot, tuned without a deploy.
 *
 * Admins only, by the same allowlist as the debate scheduling admin: the server asks geo-chat on
 * every call, and this page shows nothing until that answer comes back yes.
 */

type LabResponse = {
  storeConfigured: boolean;
  state: FreshSlotState | null;
  history: FreshSlotHistoryEntry[];
  defaults: FreshSlotConfig;
  bounds: Record<'cadence' | 'firstPosition' | 'maxPerPage' | 'freshnessHours', { min: number; max: number }>;
  seenDemotionBounds: Record<'minViews' | 'days', { min: number; max: number }>;
  rankingParams: RankingParams | null;
};

class LabRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly errors: string[] = []
  ) {
    super(errors[0] ?? code);
  }
}

const LAB_TYPES = EXPLORE_ENTITY_TYPES.filter(type => DEFAULT_EXPLORE_TYPE_IDS.includes(type.id));
const TYPE_LABEL = new Map<string, string>(EXPLORE_ENTITY_TYPES.map(type => [type.id, type.label]));

function useLabFetch() {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  return React.useCallback(
    async <T,>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
      const identity = await getPrivyIdentityToken();
      if (!identity || !accountKey) throw new LabRequestError(401, 'sign_in_required');
      const session = await getGeoChatSession(getPrivyIdentityToken, accountKey);
      const response = await fetch(path, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${identity}`,
          [GEO_CHAT_AUTHORIZATION_HEADER]: `Bearer ${session.access_token}`,
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new LabRequestError(
          response.status,
          typeof json.error === 'string' ? json.error : 'request_failed',
          Array.isArray(json.errors) ? json.errors.map(String) : []
        );
      }
      return json as T;
    },
    [accountKey, getPrivyIdentityToken]
  );
}

const NUMERIC_FIELDS: { key: keyof LabResponse['bounds']; label: string; hint: string }[] = [
  { key: 'cadence', label: 'Every N positions', hint: 'N: one fresh item every N positions' },
  { key: 'firstPosition', label: 'First position', hint: 'P: page position of the first fresh item' },
  { key: 'maxPerPage', label: 'Max per page', hint: 'K: fresh items on one page at most' },
  { key: 'freshnessHours', label: 'Fresh for (hours)', hint: 'W: an item stops being fresh at this age' },
];

const SEEN_FIELDS: { key: 'minViews' | 'days'; label: string; hint: string }[] = [
  { key: 'minViews', label: 'After N views', hint: 'N: a card shown this many times moves down' },
  { key: 'days', label: 'Within D days', hint: 'D: counting views from the last D days' },
];

function sameConfig(a: FreshSlotConfig, b: FreshSlotConfig) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function describeChange(entry: FreshSlotHistoryEntry): string {
  const parts: string[] = [];
  for (const key of ['enabled', 'cadence', 'firstPosition', 'maxPerPage', 'freshnessHours'] as const) {
    if (entry.before[key] !== entry.after[key]) parts.push(`${key} ${entry.before[key]} → ${entry.after[key]}`);
  }
  const caps = new Set([...Object.keys(entry.before.perTypeCaps), ...Object.keys(entry.after.perTypeCaps)]);
  for (const typeId of caps) {
    const before = entry.before.perTypeCaps[typeId];
    const after = entry.after.perTypeCaps[typeId];
    if (before !== after) {
      parts.push(`${TYPE_LABEL.get(typeId) ?? typeId.slice(0, 8)} cap ${before ?? 'none'} → ${after ?? 'none'}`);
    }
  }
  for (const key of ['enabled', 'minViews', 'days'] as const) {
    const before = entry.before.seenDemotion[key];
    const after = entry.after.seenDemotion[key];
    if (before !== after) parts.push(`seen ${key} ${before} → ${after}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'no change';
}

export function RankingLab() {
  const { ready, authenticated, accountKey } = useGeoChatAuth();
  const labFetch = useLabFetch();
  const queryClient = useQueryClient();
  const queryKey = ['explore', 'ranking-lab', accountKey] as const;

  const lab = useQuery({
    queryKey,
    queryFn: () => labFetch<LabResponse>('/api/explore/ranking-lab'),
    enabled: ready && authenticated,
    retry: (count, error) => !(error instanceof LabRequestError && [401, 403].includes(error.status)) && count < 2,
    refetchOnWindowFocus: false,
  });

  const [draft, setDraft] = React.useState<FreshSlotConfig | null>(null);
  // An in-page confirmation, not window.confirm: a native dialog blocks the whole page.
  const [confirming, setConfirming] = React.useState<{ kind: 'save' } | { kind: 'rollback'; revision: number } | null>(
    null
  );
  const live = lab.data?.state?.config ?? lab.data?.defaults ?? null;
  React.useEffect(() => {
    if (live && draft === null) setDraft(live);
  }, [live, draft]);

  const preview = useMutation({
    mutationFn: (config: FreshSlotConfig) =>
      labFetch<RankingLabPreviewResponse>('/api/explore/ranking-lab/preview', {
        method: 'POST',
        body: { config, pages: 2 },
      }),
  });

  const save = useMutation({
    mutationFn: (config: FreshSlotConfig) =>
      labFetch<{ state: FreshSlotState; adjustments: string[] }>('/api/explore/ranking-lab', {
        method: 'PUT',
        body: { config, baseRevision: lab.data?.state?.revision ?? 0 },
      }),
    onSuccess: result => {
      setDraft(result.state.config);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const rollback = useMutation({
    mutationFn: (toRevision: number) =>
      labFetch<{ state: FreshSlotState }>('/api/explore/ranking-lab', {
        method: 'POST',
        body: { action: 'rollback', toRevision, baseRevision: lab.data?.state?.revision ?? 0 },
      }),
    onSuccess: result => {
      setDraft(result.state.config);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  if (!ready) return <LabShell>Loading…</LabShell>;
  if (!authenticated) return <LabShell>Sign in with an admin account to use the ranking lab.</LabShell>;
  if (lab.error instanceof LabRequestError && [401, 403].includes(lab.error.status)) {
    return <LabShell>The ranking lab is for admins.</LabShell>;
  }
  if (lab.isPending || !draft || !lab.data) {
    return (
      <LabShell>{lab.isError ? 'Could not load the ranking lab. Reload to try again.' : 'Checking access…'}</LabShell>
    );
  }

  const data = lab.data;
  const state = data.state;
  const dirty = live !== null && !sameConfig(draft, live);

  const setNumber = (key: keyof LabResponse['bounds'], value: string) => {
    const number = Number(value);
    if (Number.isFinite(number)) setDraft({ ...draft, [key]: number });
  };
  const setCap = (typeId: string, value: string) => {
    const perTypeCaps = { ...draft.perTypeCaps };
    if (value.trim() === '') delete perTypeCaps[typeId];
    else if (Number.isFinite(Number(value))) perTypeCaps[typeId] = Number(value);
    setDraft({ ...draft, perTypeCaps });
  };
  const setSeen = (patch: Partial<SeenDemotionConfig>) =>
    setDraft({ ...draft, seenDemotion: { ...draft.seenDemotion, ...patch } });

  return (
    <LabShell>
      <section className="flex flex-col gap-3">
        <Text as="h2" variant="mediumTitle">
          Fresh slot
        </Text>
        <Text variant="metadata" color="grey-04">
          Merges the newest eligible items into Best at read time: one every N positions from position P, at most K per
          page, while younger than W hours. An item already in Best&apos;s window is shown from Best instead.
        </Text>
        {!data.storeConfigured ? (
          <Text variant="metadata" color="red-01">
            The config store (Upstash) is not configured on this deployment: preview works, saving does not.
          </Text>
        ) : null}
        <Text variant="metadata">
          Live: {state?.config.enabled ? 'on' : 'off'} · revision {state?.revision ?? 0}
          {state?.updatedAt ? ` · saved ${new Date(state.updatedAt).toLocaleString()} by ${state.updatedBy}` : ''}
        </Text>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={event => setDraft({ ...draft, enabled: event.target.checked })}
          />
          <Text variant="body">Enabled</Text>
        </label>

        <div className="sm:grid-cols-4 grid grid-cols-2 gap-3">
          {NUMERIC_FIELDS.map(field => (
            <label key={field.key} className="flex flex-col gap-1" title={field.hint}>
              <Text variant="metadata" color="grey-04">
                {field.label} ({data.bounds[field.key].min}–{data.bounds[field.key].max})
              </Text>
              <input
                type="number"
                className="rounded border border-grey-02 px-2 py-1"
                min={data.bounds[field.key].min}
                max={data.bounds[field.key].max}
                value={draft[field.key]}
                onChange={event => setNumber(field.key, event.target.value)}
              />
            </label>
          ))}
          {LAB_TYPES.map(type => (
            <label key={type.id} className="flex flex-col gap-1">
              <Text variant="metadata" color="grey-04">
                Max {type.label} per page (blank: no cap)
              </Text>
              <input
                type="number"
                className="rounded border border-grey-02 px-2 py-1"
                min={0}
                value={draft.perTypeCaps[type.id] ?? ''}
                onChange={event => setCap(type.id, event.target.value)}
              />
            </label>
          ))}
        </div>

        <Text as="h3" variant="bodySemibold">
          Seen demotion
        </Text>
        <Text variant="metadata" color="grey-04">
          In each visitor&apos;s browser: a card shown to them N or more times in the last D days, without a click,
          moves below the unseen cards of its type on its page. The lead debate and fresh cards keep their places. Not
          shown in the preview, which has no visitor. Live: {state?.config.seenDemotion.enabled ? 'on' : 'off'}.
        </Text>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.seenDemotion.enabled}
            onChange={event => setSeen({ enabled: event.target.checked })}
          />
          <Text variant="body">Seen demotion enabled</Text>
        </label>
        <div className="sm:grid-cols-4 grid grid-cols-2 gap-3">
          {SEEN_FIELDS.map(field => (
            <label key={field.key} className="flex flex-col gap-1" title={field.hint}>
              <Text variant="metadata" color="grey-04">
                {field.label} ({data.seenDemotionBounds[field.key].min}–{data.seenDemotionBounds[field.key].max})
              </Text>
              <input
                type="number"
                className="rounded border border-grey-02 px-2 py-1"
                min={data.seenDemotionBounds[field.key].min}
                max={data.seenDemotionBounds[field.key].max}
                value={draft.seenDemotion[field.key]}
                onChange={event => {
                  const number = Number(event.target.value);
                  if (Number.isFinite(number)) setSeen({ [field.key]: number });
                }}
              />
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => preview.mutate(draft)} disabled={preview.isPending}>
            {preview.isPending ? 'Previewing…' : 'Preview'}
          </Button>
          <Button
            onClick={() => setConfirming({ kind: 'save' })}
            disabled={!dirty || save.isPending || !data.storeConfigured || confirming !== null}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="secondary" onClick={() => setDraft(live)} disabled={!dirty}>
            Discard edits
          </Button>
          <Button variant="secondary" onClick={() => setDraft(data.defaults)}>
            Defaults
          </Button>
        </div>
        {confirming?.kind === 'save' ? (
          <ConfirmBar
            message="Save these settings? Explore serves them within a minute."
            confirmLabel="Save"
            onConfirm={() => {
              save.mutate(draft);
              setConfirming(null);
            }}
            onCancel={() => setConfirming(null)}
          />
        ) : null}
        {save.error ? <ErrorLine error={save.error} /> : null}
        {save.data?.adjustments.length ? (
          <Text variant="metadata" color="grey-04">
            Clamped: {save.data.adjustments.join(', ')}
          </Text>
        ) : null}
      </section>

      {preview.error ? <ErrorLine error={preview.error} /> : null}
      {preview.data ? <Preview data={preview.data} /> : null}

      <section className="flex flex-col gap-2">
        <Text as="h2" variant="mediumTitle">
          History
        </Text>
        {data.history.length === 0 ? (
          <Text variant="metadata" color="grey-04">
            Nothing saved yet. The fresh slot is off until it is saved enabled.
          </Text>
        ) : (
          <ul className="flex flex-col divide-y divide-divider">
            {data.history.map(entry => (
              <li key={entry.revision} className="flex items-start justify-between gap-3 py-2">
                <div className="flex flex-col">
                  <Text variant="metadataMedium">
                    Revision {entry.revision} ·{' '}
                    {entry.action === 'rollback' ? `restored ${entry.restoredRevision}` : 'saved'} ·{' '}
                    {new Date(entry.at).toLocaleString()} · {entry.by}
                  </Text>
                  <Text variant="metadata" color="grey-04">
                    {describeChange(entry)}
                  </Text>
                </div>
                {entry.revision !== state?.revision ? (
                  <Button
                    variant="secondary"
                    small
                    disabled={rollback.isPending || confirming !== null}
                    onClick={() => setConfirming({ kind: 'rollback', revision: entry.revision })}
                  >
                    Restore
                  </Button>
                ) : (
                  <Text variant="metadata" color="grey-04">
                    live
                  </Text>
                )}
              </li>
            ))}
          </ul>
        )}
        {confirming?.kind === 'rollback' ? (
          <ConfirmBar
            message={`Restore the settings saved in revision ${confirming.revision}? Explore serves them within a minute.`}
            confirmLabel="Restore"
            onConfirm={() => {
              rollback.mutate(confirming.revision);
              setConfirming(null);
            }}
            onCancel={() => setConfirming(null)}
          />
        ) : null}
        {rollback.error ? <ErrorLine error={rollback.error} /> : null}
      </section>

      <RankingParamsSection params={data.rankingParams} />
    </LabShell>
  );
}

function LabShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 py-8">
      <Text as="h1" variant="largeTitle">
        Ranking lab
      </Text>
      {typeof children === 'string' ? <Text variant="body">{children}</Text> : children}
    </div>
  );
}

function ConfirmBar({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label={message}
      className="flex flex-wrap items-center gap-2 rounded border border-grey-02 p-3"
    >
      <Text variant="metadata">{message}</Text>
      <Button small onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button small variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function ErrorLine({ error }: { error: unknown }) {
  const message =
    error instanceof LabRequestError
      ? error.errors.length > 0
        ? error.errors.join('; ')
        : error.code
      : error instanceof Error
        ? error.message
        : 'Something went wrong';
  return (
    <Text variant="metadata" color="red-01">
      {message}
    </Text>
  );
}

function typeMix(items: RankingLabPreviewItem[]): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = TYPE_LABEL.get(item.typeId) ?? item.typeName ?? 'Other';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => `${label} ${count}`).join(' · ');
}

function ageLabel(createdAtSec: number): string {
  const hours = Math.max(0, (Date.now() / 1000 - createdAtSec) / 3600);
  return hours < 48 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

function Preview({ data }: { data: RankingLabPreviewResponse }) {
  return (
    <section className="flex flex-col gap-3">
      <Text as="h2" variant="mediumTitle">
        Preview
      </Text>
      <Text variant="metadata" color="grey-04">
        Your own Explore scope, Best&apos;s default types. Fresh cards are marked; the merged column uses the knobs
        above, unsaved{data.mergedVersion ? ` (${data.mergedVersion})` : ''}.
      </Text>
      {data.repeats.length > 0 ? (
        <Text variant="metadata" color="red-01">
          Repeated across pages: {data.repeats.join(', ')}
        </Text>
      ) : null}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <PreviewColumn title="Best now" pages={data.best} />
        <PreviewColumn title="Best + fresh" pages={data.merged} />
      </div>
    </section>
  );
}

function PreviewColumn({ title, pages }: { title: string; pages: RankingLabPreviewItem[][] }) {
  return (
    <div className="flex flex-col gap-4">
      <Text variant="bodySemibold">{title}</Text>
      {pages.map((page, pageIndex) => (
        <div key={pageIndex} className="flex flex-col gap-1">
          <Text variant="metadataMedium">
            Page {pageIndex + 1} · {typeMix(page)} · fresh {page.filter(item => item.fresh).length}
          </Text>
          <ol className="flex flex-col">
            {page.map((item, index) => (
              <li
                key={`${item.entityId}-${index}`}
                className={cx('flex items-baseline gap-2 rounded px-1 py-0.5', item.fresh && 'bg-grey-01')}
              >
                <Text variant="metadata" color="grey-04" className="w-6 shrink-0 text-right">
                  {index + 1}
                </Text>
                <Text variant="metadata" className="min-w-0 flex-1 truncate">
                  {item.title}
                </Text>
                <Text variant="metadata" color="grey-04" className="shrink-0">
                  {TYPE_LABEL.get(item.typeId) ?? item.typeName ?? ''} · {ageLabel(item.createdAtSec)}
                </Text>
                {item.fresh ? (
                  <Text variant="metadataMedium" className="shrink-0">
                    fresh
                  </Text>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function RankingParamsSection({ params }: { params: RankingParams | null }) {
  return (
    <section className="flex flex-col gap-2">
      <Text as="h2" variant="mediumTitle">
        Best&apos;s stored score (read-only)
      </Text>
      <Text variant="metadata" color="grey-04">
        From gaia&apos;s entity_ranking_config and entity_type_weights. Changing these needs a re-score, so it is not
        editable here yet.
      </Text>
      {params?.config ? (
        <div className="sm:grid-cols-3 grid grid-cols-2 gap-x-6 gap-y-1">
          {Object.entries(params.config)
            // GraphQL response metadata (e.g. the response cache's `__responseCacheId`), not a parameter.
            .filter(([key]) => !key.startsWith('__'))
            .map(([key, value]) => (
              <div key={key} className="flex justify-between gap-2">
                <Text as="span" variant="metadata" color="grey-04">
                  {key}
                </Text>
                <Text as="span" variant="metadata">
                  {value ?? '—'}
                </Text>
              </div>
            ))}
          {params.typeWeights.map(weight => (
            <div key={weight.typeId} className="flex justify-between gap-2">
              <Text as="span" variant="metadata" color="grey-04">
                weight: {TYPE_LABEL.get(weight.typeId) ?? weight.typeId.slice(0, 8)}
              </Text>
              <Text as="span" variant="metadata">
                {weight.weight}
              </Text>
            </div>
          ))}
        </div>
      ) : (
        <Text variant="metadata" color="grey-04">
          Could not read them.
        </Text>
      )}
    </section>
  );
}
