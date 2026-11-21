'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { TopicAgreementSeriesModel, TopicTrendsModel } from '../models';
import { TEMPLATE_CARD_SURFACE } from './template-shell';

export interface TopicTrendsChartProps {
  trends: TopicTrendsModel;
  className?: string;
}

function rollingAverage(values: readonly number[], windowSize = 4): number[] {
  return values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - windowSize + 1), index + 1);
    return slice.reduce((sum, item) => sum + item, 0) / slice.length;
  });
}

function toPolyline(values: readonly number[], weeks: number, mapValue: (v: number) => number): string {
  const denom = Math.max(1, weeks - 1);
  return values
    .map((value, index) => `${((index * 100) / denom).toFixed(2)},${(100 - mapValue(value)).toFixed(2)}`)
    .join(' ');
}

/**
 * Interactive Coverage (weekly stacked bars by theme) & Agreement (weekly community gap /
 * per-community drill-down) SVG chart styled to Geo's crisp white/black + purple/blue editorial palette.
 */
export function TopicTrendsChart({ trends, className }: TopicTrendsChartProps) {
  const hasAgreement = Boolean(trends.agreementSeries && trends.agreementSeries.length > 0);
  const [mode, setMode] = React.useState<'coverage' | 'agreement'>('coverage');
  const [selectedThemeIdx, setSelectedThemeIdx] = React.useState<number | null>(null);
  const [agreementGroup, setAgreementGroup] = React.useState<'split' | 'common'>('split');
  const [selectedSeriesIdx, setSelectedSeriesIdx] = React.useState<number | null>(null);

  const activeMode = mode === 'agreement' && hasAgreement ? 'agreement' : 'coverage';
  const weeks = trends.weekLabels.length;
  const xForWeek = (weekIndex: number) => (weekIndex * 100) / Math.max(1, weeks - 1);

  const weeklyTotals = React.useMemo(() => {
    return Array.from({ length: weeks }, (_, w) =>
      trends.coverageThemes.reduce((acc, theme) => acc + (theme.weeklyCounts[w] ?? 0), 0)
    );
  }, [trends.coverageThemes, weeks]);

  const maxWeeklyCoverage = Math.max(20, Math.ceil(Math.max(...weeklyTotals, 1) / 20) * 20);
  const peakWeekCount = Math.max(...weeklyTotals, 0);
  const peakWeekIdx = weeklyTotals.indexOf(peakWeekCount);

  const agreementItems = React.useMemo(() => {
    const list = (trends.agreementSeries ?? []).filter(series => series.group === agreementGroup);
    return list.map(series => {
      const gap = series.communityAWeekly.map((a, i) => Math.abs(a - (series.communityBWeekly[i] ?? a)));
      const avg = rollingAverage(gap, 4);
      const start = avg[Math.min(3, avg.length - 1)] ?? 0;
      const end = avg[avg.length - 1] ?? 0;
      const delta = end - start;
      const trendWord = delta < -3 ? 'Converging' : delta > 3 ? 'Widening' : 'Steady';
      return {
        series,
        gap,
        avg,
        delta,
        trendLabel: `${trendWord} ${Math.round(start)} → ${Math.round(end)} pts`,
      };
    });
  }, [agreementGroup, trends.agreementSeries]);

  const activeSeries: TopicAgreementSeriesModel | null =
    selectedSeriesIdx !== null ? (agreementItems[selectedSeriesIdx]?.series ?? null) : null;

  const verdictText = React.useMemo(() => {
    if (activeMode === 'coverage') {
      const peakLabel = trends.weekLabels[peakWeekIdx] ?? '';
      return peakLabel
        ? `Peaked at ${peakWeekCount} stories in the week of ${peakLabel}.`
        : `${weeklyTotals.reduce((a, b) => a + b, 0)} linked stories across ${weeks} weeks.`;
    }
    if (selectedSeriesIdx !== null && agreementItems[selectedSeriesIdx]) {
      const item = agreementItems[selectedSeriesIdx];
      return `${item.series.name} · ${item.trendLabel}`;
    }
    const widening = agreementItems.filter(item => item.delta > 3).length;
    const converging = agreementItems.filter(item => item.delta < -3).length;
    return agreementGroup === 'split'
      ? `${widening} of ${agreementItems.length} widening, ${converging} converging`
      : `${converging} of ${agreementItems.length} converging, ${widening} widening`;
  }, [
    activeMode,
    agreementGroup,
    agreementItems,
    peakWeekCount,
    peakWeekIdx,
    selectedSeriesIdx,
    trends.weekLabels,
    weeklyTotals,
    weeks,
  ]);

  const yLabels =
    activeMode === 'coverage'
      ? [`${maxWeeklyCoverage} / wk`, String(maxWeeklyCoverage / 2), '0']
      : activeSeries
        ? ['100%', '50%', '0%']
        : ['100 pts', '50', '0'];

  const colorA = trends.communityAColor ?? '#6833ff';
  const colorB = trends.communityBColor ?? '#3963fe';

  return (
    <section
      aria-label="Coverage and agreement over time"
      className={cx('flex flex-col gap-5 p-5 @[560px]:p-6', TEMPLATE_CARD_SURFACE, className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-mediumTitle font-semibold text-text">How it’s moving</h2>
          <p className="m-0 text-[15px] leading-[21px] text-grey-04">{verdictText}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasAgreement && (
            <div className="inline-flex rounded-full border border-grey-02 bg-grey-01 p-0.5">
              {(['coverage', 'agreement'] as const).map(option => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={activeMode === option}
                  onClick={() => {
                    setMode(option);
                    setSelectedThemeIdx(null);
                    setSelectedSeriesIdx(null);
                  }}
                  className={cx(
                    'cursor-pointer rounded-full border-0 px-3.5 py-1.5 text-[14px] font-medium transition-colors',
                    activeMode === option ? 'bg-text text-white' : 'bg-transparent text-grey-04 hover:text-text'
                  )}
                >
                  {option === 'coverage' ? 'Coverage' : 'Agreement'}
                </button>
              ))}
            </div>
          )}

          {activeMode === 'agreement' && (
            <div className="inline-flex rounded-full border border-grey-02 bg-white p-0.5">
              {(
                [
                  ['split', 'Where they split'],
                  ['common', 'Common ground'],
                ] as const
              ).map(([group, label]) => (
                <button
                  key={group}
                  type="button"
                  aria-pressed={agreementGroup === group}
                  onClick={() => {
                    setAgreementGroup(group);
                    setSelectedSeriesIdx(null);
                  }}
                  className={cx(
                    'cursor-pointer rounded-full border-0 px-3 py-1 text-[14px] font-medium transition-colors',
                    agreementGroup === group ? 'bg-grey-01 text-text' : 'bg-transparent text-grey-04 hover:text-text'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Interactive legend chips */}
      <div className="flex flex-wrap gap-2">
        {activeMode === 'coverage'
          ? trends.coverageThemes.map((theme, index) => {
              const isSelected = selectedThemeIdx === index;
              const total = theme.weeklyCounts.reduce((a, b) => a + b, 0);
              return (
                <button
                  key={theme.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedThemeIdx(prev => (prev === index ? null : index))}
                  className={cx(
                    'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-[14px] transition-colors',
                    isSelected
                      ? 'border-text bg-text text-white'
                      : 'border-grey-02 bg-white text-text hover:border-text'
                  )}
                >
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-full"
                    style={{ backgroundColor: theme.color }}
                  />
                  <span className="font-medium">{theme.name}</span>
                  <span className={cx('tabular-nums', isSelected ? 'text-grey-03' : 'text-grey-04')}>{total}</span>
                </button>
              );
            })
          : agreementItems.map((item, index) => {
              const isSelected = selectedSeriesIdx === index;
              return (
                <button
                  key={item.series.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedSeriesIdx(prev => (prev === index ? null : index))}
                  className={cx(
                    'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-[14px] transition-colors',
                    isSelected
                      ? 'border-text bg-text text-white'
                      : 'border-grey-02 bg-white text-text hover:border-text'
                  )}
                >
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-full"
                    style={{ backgroundColor: item.series.color }}
                  />
                  <span className="font-medium">{item.series.name}</span>
                  <span className={cx('text-[13px] tabular-nums', isSelected ? 'text-grey-03' : 'text-grey-04')}>
                    {item.trendLabel}
                  </span>
                </button>
              );
            })}
      </div>

      {/* SVG plot */}
      <div className="relative flex flex-col gap-2">
        <div className="flex items-stretch gap-3">
          <div className="flex w-[64px] shrink-0 flex-col justify-between py-0.5 text-right text-[13px] text-grey-04 tabular-nums">
            <span>{yLabels[0]}</span>
            <span>{yLabels[1]}</span>
            <span>{yLabels[2]}</span>
          </div>

          <div className="relative min-w-0 flex-1">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              role="img"
              aria-label={activeMode === 'coverage' ? 'Weekly coverage by theme' : 'Weekly community agreement trend'}
              className="h-[200px] w-full overflow-visible"
            >
              {[0, 50, 100].map(y => (
                <line
                  key={y}
                  x1="0"
                  x2="100"
                  y1={y}
                  y2={y}
                  stroke="#f0f0f0"
                  strokeWidth="0.7"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {trends.markers.map((marker, idx) => (
                <line
                  key={`${marker.weekIndex}-${idx}`}
                  x1={xForWeek(marker.weekIndex)}
                  x2={xForWeek(marker.weekIndex)}
                  y1="0"
                  y2="100"
                  stroke="#dbdbdb"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {activeMode === 'coverage' ? (
                Array.from({ length: weeks }, (_, w) => {
                  let acc = 0;
                  const barWidth = (100 / Math.max(1, weeks)) * 0.72;
                  const barX = (w * 100) / Math.max(1, weeks) + 0.14;
                  return trends.coverageThemes.map((theme, themeIdx) => {
                    const count = theme.weeklyCounts[w] ?? 0;
                    const height = (count / maxWeeklyCoverage) * 100;
                    const y = 100 - (acc + height);
                    acc += height;
                    const opacity = selectedThemeIdx === null || selectedThemeIdx === themeIdx ? 0.92 : 0.15;
                    return (
                      <rect
                        key={`${w}-${theme.id}`}
                        x={barX}
                        y={y}
                        width={barWidth}
                        height={Math.max(0, height)}
                        fill={theme.color}
                        opacity={opacity}
                      />
                    );
                  });
                })
              ) : activeSeries ? (
                <>
                  {[
                    { values: activeSeries.communityAWeekly, color: colorA, key: 'a' },
                    { values: activeSeries.communityBWeekly, color: colorB, key: 'b' },
                  ].map(line => (
                    <React.Fragment key={line.key}>
                      <polyline
                        fill="none"
                        stroke={line.color}
                        strokeOpacity="0.25"
                        strokeWidth="1.2"
                        vectorEffect="non-scaling-stroke"
                        points={toPolyline(line.values, weeks, v => v)}
                      />
                      <polyline
                        fill="none"
                        stroke={line.color}
                        strokeWidth="2.5"
                        vectorEffect="non-scaling-stroke"
                        points={toPolyline(rollingAverage(line.values, 4), weeks, v => v)}
                      />
                    </React.Fragment>
                  ))}
                </>
              ) : (
                agreementItems.map(item => (
                  <React.Fragment key={item.series.id}>
                    <polyline
                      fill="none"
                      stroke={item.series.color}
                      strokeOpacity="0.22"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                      points={toPolyline(item.gap, weeks, v => v)}
                    />
                    <polyline
                      fill="none"
                      stroke={item.series.color}
                      strokeWidth="2.5"
                      vectorEffect="non-scaling-stroke"
                      points={toPolyline(item.avg, weeks, v => v)}
                    />
                  </React.Fragment>
                ))
              )}
            </svg>

            <div className="relative mt-2 h-5 text-[13px] text-grey-04">
              {trends.monthTicks.map(tick => (
                <span
                  key={tick.label}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${xForWeek(tick.weekIndex)}%` }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {trends.markers.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2 border-t border-divider pt-3 text-[14px] text-grey-04">
            {trends.markers.map((marker, idx) => {
              const inner = (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-grid size-5 shrink-0 place-items-center rounded-full bg-grey-01 text-[12px] font-semibold text-text">
                    {idx + 1}
                  </span>
                  <span>{marker.label}</span>
                </span>
              );
              if (marker.href) {
                return (
                  <Link key={marker.label} href={marker.href} className="text-grey-04 no-underline hover:text-text">
                    {inner}
                  </Link>
                );
              }
              if (marker.onSelect) {
                return (
                  <button
                    key={marker.label}
                    type="button"
                    onClick={marker.onSelect}
                    className="cursor-pointer border-0 bg-transparent p-0 text-left text-[14px] text-grey-04 hover:text-text"
                  >
                    {inner}
                  </button>
                );
              }
              return <span key={marker.label}>{inner}</span>;
            })}
          </div>
        )}
      </div>

      <p className="m-0 text-[14px] leading-[20px] text-grey-04">
        {activeMode === 'coverage'
          ? (trends.coverageCaption ??
            'Stories and sources linked to this topic each week, grouped by theme. Tap a theme to isolate it.')
          : activeSeries
            ? `${activeSeries.name}: ${trends.communityALabel ?? 'Community A'} vs ${trends.communityBLabel ?? 'Community B'} weekly % agree (thick line = 4-week rolling average).`
            : 'Thin lines show weekly percentage-point spread between communities; thick lines show the 4-week average. Tap any claim to inspect each community.'}
      </p>
    </section>
  );
}
