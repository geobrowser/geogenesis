'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

import { QuestionCircle } from '~/design-system/icons/question-circle';

import type { VotingSettingsFormState } from './voting-settings';

type Props = {
  state: VotingSettingsFormState;
  onChange: (next: VotingSettingsFormState) => void;
  disabled?: boolean;
};

/**
 * The four governance settings the design exposes: slow-path threshold (slider),
 * vote duration (days/hours/minutes/seconds), fast-path votes, and quorum. Shared
 * between create-space "advanced" settings and the edit-existing-space proposal modal.
 */
export function VotingSettingsFields({ state, onChange, disabled = false }: Props) {
  const set = <K extends keyof VotingSettingsFormState>(key: K, value: string) => {
    onChange({ ...state, [key]: value });
  };

  const thresholdValue = clampPercentForSlider(state.slowPathThresholdPercent);

  return (
    <div className="flex flex-col gap-4">
      <SettingRow label="Slow path threshold" hint="Percentage of YES votes needed for a review-path proposal to pass.">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={thresholdValue}
            disabled={disabled}
            onChange={e => set('slowPathThresholdPercent', e.target.value)}
            className="h-1 w-[100px] cursor-pointer accent-text disabled:cursor-not-allowed"
            aria-label="Slow path threshold"
          />
          <span className="w-9 text-right text-quoteMedium tabular-nums">{thresholdValue}%</span>
        </div>
      </SettingRow>

      <Divider />

      <div className="flex flex-col gap-3">
        <SettingLabel label="Vote duration" hint="How long a review-path proposal stays open for voting." />
        <div className="flex items-stretch gap-1.5 text-center">
          <DurationInput label="Day" value={state.durationDays} onChange={v => set('durationDays', v)} disabled={disabled} />
          <DurationInput label="Hours" value={state.durationHours} onChange={v => set('durationHours', v)} disabled={disabled} />
          <DurationInput
            label="Minutes"
            value={state.durationMinutes}
            onChange={v => set('durationMinutes', v)}
            disabled={disabled}
          />
          <DurationInput
            label="Seconds"
            value={state.durationSeconds}
            onChange={v => set('durationSeconds', v)}
            disabled={disabled}
          />
        </div>
      </div>

      <Divider />

      <SettingRow
        label="Fast path votes"
        hint="Number of editor votes that instantly approve a fast-path proposal. Minimum 1."
      >
        <ValueInput value={state.fastPathVotes} onChange={v => set('fastPathVotes', v)} disabled={disabled} />
      </SettingRow>

      <Divider />

      <SettingRow label="Quorum" hint="Minimum number of editors that must vote for a review-path proposal to be valid.">
        <ValueInput value={state.quorum} onChange={v => set('quorum', v)} disabled={disabled} />
      </SettingRow>
    </div>
  );
}

function Divider() {
  return <div className="h-px w-full bg-divider" />;
}

function SettingLabel({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-quoteMedium">{label}</span>
      <HintTooltip hint={hint} />
    </div>
  );
}

/**
 * A hover hint that survives inside the governance modal. The design-system tooltip is
 * portaled through a Radix popper wrapper whose stacking context is `z-index: auto`, so
 * it renders *behind* a Dialog that has an explicit z-index. This portals straight to
 * the body with an inline max z-index on the positioned element, so it always paints on
 * top and is never clipped by the modal's overflow.
 */
function HintTooltip({ hint }: { hint: string }) {
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = React.useState<{ left: number; top: number } | null>(null);

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ left: rect.left + rect.width / 2, top: rect.top });
  };
  const hide = () => setCoords(null);

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex cursor-help text-grey-04"
        tabIndex={0}
        aria-label={hint}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <QuestionCircle />
      </span>
      {coords !== null &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left: coords.left,
              top: coords.top - 8,
              transform: 'translate(-50%, -100%)',
              zIndex: 2147483000,
            }}
            className="pointer-events-none max-w-[220px] rounded bg-text px-2 py-1.5 text-center text-metadata leading-snug text-white shadow-button"
          >
            {hint}
          </div>,
          document.body
        )}
    </>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <SettingLabel label={label} hint={hint} />
      {children}
    </div>
  );
}

type DurationInputProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
};

function DurationInput({ label, value, onChange, disabled }: DurationInputProps) {
  return (
    <label className="flex flex-1 flex-col items-center gap-1 rounded-lg border border-divider py-1.5">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        inputMode="numeric"
        disabled={disabled}
        aria-label={label}
        className="w-full bg-transparent text-center text-quoteMedium tabular-nums focus:outline-none disabled:text-grey-03"
      />
      <span className="text-metadata text-grey-04">{label}</span>
    </label>
  );
}

function ValueInput({ value, onChange, disabled }: { value: string; onChange: (next: string) => void; disabled?: boolean }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      inputMode="numeric"
      disabled={disabled}
      className="w-14 rounded border border-grey-02 px-2 py-1 text-right text-quoteMedium tabular-nums focus:border-text focus:outline-none disabled:text-grey-03"
    />
  );
}

function clampPercentForSlider(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}
