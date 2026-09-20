'use client';

import * as React from 'react';

import {
  HubFilterMenu,
  type HubFilterOption,
  HubMultiFilterMenu,
  pickerLabel,
} from '~/core/debates/matchmaking/hub-filter-menu';

/**
 * The control row above a profile record tab (GEO-2918).
 *
 * The same three shapes the debates hub already draws — a single-select pill for
 * the sort, multi-selects for the dimensions — rather than a fourth set of menu
 * markup. `EntityFeed` hand-rolls its own sort trigger; this does not copy it,
 * because `HubFilterMenu` is the same control with a name.
 *
 * Presentational and fully controlled. Each tab owns its own state and its own
 * fetcher: the three record tabs read from three different connections and no
 * amount of shared markup makes them one query.
 *
 * **Which dimensions appear is per tab, and is a statement about the data.** A
 * dimension that collapses to one value is not offered at all — measured on the
 * reference account, and on the whole graph where the whole graph could answer:
 *
 * - *Topics* earn their place on Positions: 349 distinct across 208 claims.
 * - *Type* earns nobody's. Every object anyone has ever cast a stance or veracity
 *   vote on is a `Claim` — 1,166 of 1,166 — and Debates is filtered to `Debate`
 *   by construction. A menu with one row in it is a control that cannot act.
 */
export function RecordFilterRow({ sort, dimensions }: RecordFilterRowProps) {
  const hasDimensions = dimensions.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <HubFilterMenu
        label={sort.options.find(option => option.value === sort.value)?.label ?? sort.value}
        options={sort.options}
        value={sort.value}
        onChange={sort.onChange}
        showImages={false}
      />

      {hasDimensions ? (
        <div className="ml-auto flex items-center gap-3">
          {dimensions.map(dimension => (
            <HubMultiFilterMenu
              key={dimension.key}
              label={dimensionLabel(dimension)}
              options={dimension.options}
              values={dimension.values}
              onToggle={dimension.onToggle}
              onClear={dimension.onClear}
              clearLabel={dimension.anyLabel}
              showImages={dimension.showImages ?? false}
              countsPending={dimension.isPending}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type RecordFilterDimension = {
  /** React key, and the thing this narrows by: `spaces`, `topics`. */
  key: string;
  options: HubFilterOption<string>[];
  values: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  /** The trigger's wording with nothing picked, and the clear row's: "Any space". */
  anyLabel: string;
  /** Singular and plural for the counted form: `['space', 'spaces']`. */
  noun: readonly [string, string];
  showImages?: boolean;
  /** Facets still arriving. The menu holds its numbers briefly rather than flashing skeletons. */
  isPending?: boolean;
};

type RecordFilterRowProps = {
  sort: {
    value: string;
    options: HubFilterOption<string>[];
    onChange: (value: string) => void;
  };
  dimensions: RecordFilterDimension[];
};

/**
 * What the trigger pill says, through the hub's own wording helper.
 *
 * `pickerLabel` is what the explore feed's space pill already uses, so a reader
 * moving between the two surfaces meets one convention: the name when a single
 * thing is picked, a count when several are.
 *
 * The one judgement here is the fallback. These options are *facets over the
 * list*, so a selection can outlive the row that produced it — pick a topic,
 * then pick a space that excludes it, and the topic is still filtering while its
 * option is gone. Falling back to "Any topic" would say the filter is off while
 * it is on, so the counted form is used instead.
 */
export function dimensionLabel(dimension: Pick<RecordFilterDimension, 'values' | 'options' | 'anyLabel' | 'noun'>) {
  return pickerLabel(
    dimension.values.length,
    dimension.anyLabel,
    () => dimension.options.find(option => option.value === dimension.values[0])?.label ?? `1 ${dimension.noun[0]}`,
    count => `${count} ${dimension.noun[1]}`
  );
}
