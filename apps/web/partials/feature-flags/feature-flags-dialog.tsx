'use client';

import { Content, Description, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import { featureFlagDefinitions, useFeatureFlags } from '~/core/state/feature-flags';

import { SquareButton } from '~/design-system/button';
import { Checkbox } from '~/design-system/checkbox';
import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

export function FeatureFlagsDialog() {
  const [open, setOpen] = React.useState(false);
  const { flags, setFeatureFlag } = useFeatureFlags();

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== 'f') return;

      event.preventDefault();
      setOpen(value => !value);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Root open={open} onOpenChange={setOpen}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />

        <Content className="fixed inset-0 z-101 flex items-start justify-center focus:outline-hidden">
          <div className="mt-32 flex w-[420px] max-w-[calc(100vw-32px)] flex-col gap-4 rounded-xl bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <Title asChild>
                <Text variant="smallTitle" as="h2">
                  Feature flags
                </Text>
              </Title>
              <Description className="sr-only">Toggle local preview features for this browser.</Description>
              <SquareButton onClick={() => setOpen(false)} icon={<Close />} aria-label="Close feature flags" />
            </div>

            <div className="flex flex-col divide-y divide-grey-02">
              {featureFlagDefinitions.map(feature => (
                <div key={feature.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-button text-text">{feature.label}</span>
                    <span className="text-footnote text-grey-04">{feature.description}</span>
                  </div>
                  <Checkbox
                    checked={flags[feature.id]}
                    onChange={() => setFeatureFlag(feature.id, !flags[feature.id])}
                    aria-label={feature.label}
                    aria-pressed={flags[feature.id]}
                    className="mt-0.5 shrink-0"
                  />
                </div>
              ))}
            </div>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
