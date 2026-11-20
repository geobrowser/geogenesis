'use client';

import { Content, Description, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Input } from '~/design-system/input';

import type { ChatViewPerson } from './types';

/** The channel dialogs' frame (GEO-3818): centred on desktop, a sheet from the bottom on phones. */
export function ChannelDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />
        <Content className="fixed inset-0 z-101 flex items-center justify-center px-4 py-8 focus:outline-hidden mobile:items-end mobile:px-0 mobile:pb-0">
          <div className="flex max-h-full w-[520px] max-w-full flex-col gap-4 overflow-y-auto rounded-xl bg-white p-4 shadow-lg mobile:w-full mobile:rounded-b-none">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Title className="text-smallTitle text-text">{title}</Title>
                <Description className="mt-1 text-footnote text-grey-04">{description}</Description>
              </div>
              <SquareButton onClick={() => onOpenChange(false)} icon={<Close />} aria-label="Close" />
            </div>
            {children}
          </div>
        </Content>
      </Portal>
    </Root>
  );
}

export const PEOPLE_FIELD_COPY = {
  label: 'Invite people',
  placeholder: 'Add people',
  remove: (name: string) => `Remove ${name}`,
  none: 'No one matches.',
} as const;

const RESULTS = 6;

/**
 * Picks people from `candidates`, the space's editors and members, as chips. The chat composer's
 * mention search, as a field.
 */
export function PeopleField({
  candidates,
  picked,
  onChange,
  exclude = [],
  label = PEOPLE_FIELD_COPY.label,
}: {
  candidates: ChatViewPerson[];
  picked: ChatViewPerson[];
  onChange: (people: ChatViewPerson[]) => void;
  /** Dashless ids not to offer, such as people already in the channel. */
  exclude?: string[];
  label?: string;
}) {
  const [query, setQuery] = React.useState('');
  const id = React.useId();
  const taken = new Set([...exclude, ...picked.map(person => person.id)]);
  const needle = query.trim().toLowerCase();
  const results = needle
    ? candidates.filter(person => !taken.has(person.id) && person.name.toLowerCase().includes(needle)).slice(0, RESULTS)
    : [];

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-footnoteMedium text-grey-04">
        {label}
      </label>
      {picked.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {picked.map(person => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => onChange(picked.filter(other => other.id !== person.id))}
                aria-label={PEOPLE_FIELD_COPY.remove(person.name)}
                className="flex items-center gap-1.5 rounded-full border border-grey-02 py-0.5 pr-2 pl-0.5 text-footnote text-text hover:bg-grey-01"
              >
                <span className="block size-5 overflow-hidden rounded-full">
                  <Avatar avatarUrl={person.avatarUrl} value={person.avatarSeed} size={20} />
                </span>
                {person.name}
                <span aria-hidden className="text-grey-04">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative">
        <Input
          id={id}
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={PEOPLE_FIELD_COPY.placeholder}
          autoComplete="off"
          onKeyDown={event => {
            if (event.key === 'Enter' && results[0]) {
              event.preventDefault();
              onChange([...picked, results[0]]);
              setQuery('');
            }
          }}
        />
        {needle ? (
          <ul
            role="listbox"
            aria-label={PEOPLE_FIELD_COPY.placeholder}
            className="absolute top-full left-0 z-10 mt-1 w-full overflow-hidden rounded-md border border-grey-02 bg-white py-1 shadow-light"
          >
            {results.length === 0 ? (
              <li className="px-2 py-1 text-metadata text-grey-04">{PEOPLE_FIELD_COPY.none}</li>
            ) : (
              results.map(person => (
                <li key={person.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange([...picked, person]);
                      setQuery('');
                    }}
                    className="flex w-full items-center gap-2 px-2 py-1 text-left text-metadata text-text hover:bg-grey-01"
                  >
                    <span className="block size-5 shrink-0 overflow-hidden rounded-full">
                      <Avatar avatarUrl={person.avatarUrl} value={person.avatarSeed} size={20} />
                    </span>
                    <span className="truncate">{person.name}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
