'use client';

import * as React from 'react';

import Link from 'next/link';

import { useProfileFacts } from '~/core/hooks/use-profile-facts';
import { type Verifier, formatJoined, timeOnGeo } from '~/core/profile/profile-facts';
import { type ProfileLink } from '~/core/profile/profile-links';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';
import { SpacePillSectionHeading } from '~/design-system/space-pill';

import { type SideRailSection, SideRailSections } from '~/partials/entity-page/sticky-side-rail';

type Props = {
  /** The personal space being viewed. */
  spaceId: string;
  /** The person entity, for the join date. */
  personEntityId: string | null;
  /** Types on the person entity — Person and Space, on one entity. */
  types: { id: string; name: string | null }[];
  links: ProfileLink[];
  /** Where the space's own record is shown, folded away. */
  systemEntityId: string;
  address: string | null;
  spaceType: 'DAO' | 'PERSONAL';
};

/**
 * The facts a profile states about an account (GEO-2859).
 *
 * Three sections, in the order a reader wants them: where this person works in
 * the graph, how to reach them, then the facts — ending in the space's own
 * record, folded away.
 *
 * Rule-separated sections rather than bordered cards, which is how every other
 * rail in the app composes.
 */
export function ProfileRail({ spaceId, personEntityId, types, links, systemEntityId, address, spaceType }: Props) {
  const { facts, isLoading } = useProfileFacts({ spaceId, personEntityId });

  const sections: SideRailSection[] = [];

  if (facts.spaces.length > 0) {
    sections.push({ key: 'spaces', node: <SpacesSection spaces={facts.spaces} /> });
  }

  if (links.length > 0) {
    sections.push({ key: 'links', node: <LinksSection links={links} /> });
  }

  sections.push({
    key: 'about',
    node: (
      <AboutSection
        facts={facts}
        isLoading={isLoading}
        types={types}
        spaceId={spaceId}
        systemEntityId={systemEntityId}
        address={address}
        spaceType={spaceType}
      />
    ),
  });

  return <SideRailSections sections={sections} />;
}

function SpacesSection({ spaces }: { spaces: ReturnType<typeof useProfileFacts>['facts']['spaces'] }) {
  const [showAll, setShowAll] = React.useState(false);
  const shown = showAll ? spaces : spaces.slice(0, 6);

  return (
    <section className="flex flex-col">
      <SpacePillSectionHeading>Spaces</SpacePillSectionHeading>
      <ul className="flex flex-col gap-1">
        {shown.map(space => (
          <li key={space.id}>
            <Link
              href={NavUtils.toSpace(space.id)}
              className="flex items-center gap-2 rounded py-1 transition-colors hover:bg-grey-01"
            >
              {/* Nine of the reference account's 33 have no name. A blank row in
                  a list of 33 reads as a loading failure. */}
              <span className="min-w-0 flex-1 truncate text-metadata text-text">{space.name ?? 'Untitled space'}</span>
              {space.isEditor && (
                <span className="shrink-0 rounded-full border border-grey-02 px-2 text-tag text-grey-04">Editor</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {spaces.length > 6 && (
        <button
          type="button"
          onClick={() => setShowAll(value => !value)}
          className="mt-2 self-start text-metadata text-ctaPrimary hover:underline"
        >
          {showAll ? 'Show fewer' : `See all ${spaces.length}`}
        </button>
      )}
    </section>
  );
}

function LinksSection({ links }: { links: ProfileLink[] }) {
  return (
    <section className="flex flex-col">
      <SpacePillSectionHeading>Links</SpacePillSectionHeading>
      <ul className="flex flex-col gap-1">
        {links.map(link => (
          <li key={link.propertyId} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-metadata text-grey-04">{link.label}</span>
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-metadata text-ctaPrimary hover:underline"
            >
              {link.handle}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AboutSection({
  facts,
  isLoading,
  types,
  spaceId,
  systemEntityId,
  address,
  spaceType,
}: {
  facts: ReturnType<typeof useProfileFacts>['facts'];
  isLoading: boolean;
  types: Props['types'];
  spaceId: string;
  systemEntityId: string;
  address: string | null;
  spaceType: Props['spaceType'];
}) {
  const joined = formatJoined(facts.joinedAt);
  const elapsed = timeOnGeo(facts.joinedAt);

  return (
    <section className="flex flex-col">
      <SpacePillSectionHeading>About</SpacePillSectionHeading>

      <dl className="flex flex-col">
        {/* Counts first. They are what the rest of this section explains. */}
        <Fact label="Proposals" value={isLoading ? null : facts.proposals.toLocaleString()} />
        <Fact label="Positions" value={isLoading ? null : facts.positions.toLocaleString()} />
        <Fact label="Debates" value={isLoading ? null : facts.debates.toLocaleString()} />

        {facts.verifiedBy.length > 0 && (
          <Row label="Verified by">
            <VerifiedBy verifiers={facts.verifiedBy} />
          </Row>
        )}

        {joined && <Fact label="Joined" value={elapsed ? `${joined} · ${elapsed}` : joined} />}

        <Fact label="Space type" value={spaceType === 'PERSONAL' ? 'Personal' : 'DAO'} />

        {types.length > 0 && (
          <Row label="Types">
            <span className="flex flex-wrap justify-end gap-1">
              {types.map(type => (
                <Link
                  key={type.id}
                  href={NavUtils.toEntity(spaceId, type.id)}
                  className="rounded-full border border-grey-02 px-2 py-px text-tag text-ctaPrimary hover:border-ctaPrimary"
                >
                  {type.name ?? 'Untitled'}
                </Link>
              ))}
            </span>
          </Row>
        )}

        {address && <Fact label="Account" value={shortenAddress(address)} mono />}
      </dl>

      <SystemRecord spaceId={spaceId} systemEntityId={systemEntityId} address={address} spaceType={spaceType} />
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-divider py-2 last:border-b-0">
      <dt className="shrink-0 text-metadata text-grey-04">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <Row label={label}>
      {value === null ? (
        <span className="inline-block h-4 w-10 animate-pulse rounded bg-grey-01" />
      ) : (
        <span className={mono ? 'font-mono text-tag text-text' : 'text-metadata text-text'}>{value}</span>
      )}
    </Row>
  );
}

/**
 * Everyone who has vouched for this person, as a stack that opens a list.
 *
 * People and spaces in one list: a verification is a subspace relation from the
 * verifier's own space, and a person's is simply the personal one.
 */
function VerifiedBy({ verifiers }: { verifiers: Verifier[] }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const shown = verifiers.slice(0, 3);
  const rest = verifiers.length - shown.length;

  return (
    <div className="relative inline-flex flex-col items-end">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        aria-label={`Verified by ${verifiers.length} ${verifiers.length === 1 ? 'space or person' : 'spaces and people'}`}
        className="inline-flex items-center gap-2 text-metadata text-text hover:underline"
      >
        <AvatarGroup>
          {shown.map(verifier => (
            <AvatarGroup.Item key={verifier.spaceId} size={20}>
              <Avatar size={20} value={verifier.spaceId} avatarUrl={verifier.avatarUrl ?? undefined} />
            </AvatarGroup.Item>
          ))}
        </AvatarGroup>
        <span>{rest > 0 ? `+${rest}` : verifiers.length}</span>
      </button>

      {isOpen && (
        <ul className="absolute top-full right-0 z-30 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-grey-02 bg-white py-1 shadow-dropdown">
          {verifiers.map(verifier => (
            <li key={verifier.spaceId}>
              <Link
                href={NavUtils.toSpace(verifier.spaceId)}
                className="flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-grey-01"
              >
                <Avatar size={20} value={verifier.spaceId} avatarUrl={verifier.avatarUrl ?? undefined} />
                <span className="min-w-0 flex-1 truncate text-metadata text-text">
                  {verifier.name ?? (verifier.isPerson ? 'Untitled person' : 'Untitled space')}
                </span>
                <span className="shrink-0 text-tag text-grey-04">{verifier.isPerson ? 'Person' : 'Space'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The space's own record, present and folded away.
 *
 * A `<details>` rather than an overflow menu: it is in the tab order, findable
 * by in-page search and linkable, which a menu is not. The ids here are the ones
 * anybody debugging this page needs and nobody else ever wants.
 */
function SystemRecord({
  spaceId,
  systemEntityId,
  address,
  spaceType,
}: {
  spaceId: string;
  systemEntityId: string;
  address: string | null;
  spaceType: Props['spaceType'];
}) {
  return (
    <details className="mt-3 border-t border-dashed border-grey-02 pt-2">
      <summary className="cursor-pointer list-none text-metadata text-grey-04 hover:text-text">
        Space system data
      </summary>
      <dl className="mt-2 flex flex-col gap-1">
        <SystemRow label="Space id" value={spaceId} />
        <SystemRow label="Entity id" value={systemEntityId} />
        <SystemRow label="Type" value={spaceType} />
        {address && <SystemRow label="Address" value={address} />}
      </dl>
    </details>
  );
}

function SystemRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
      <dt className="text-tag text-grey-04">{label}</dt>
      <dd className="font-mono text-tag break-all text-text">{value}</dd>
    </div>
  );
}

/** `0xab28…d3b9` — enough to recognise, short enough for a rail row. */
function shortenAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
