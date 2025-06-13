import { cookies } from 'next/headers';
import Image from 'next/legacy/image';

import * as React from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { WALLET_ADDRESS } from '~/core/cookie';
import { fetchProfile } from '~/core/io/subgraph';
import {
  NavUtils,
  getImagePath,
  getIsProposalEnded,
  getIsProposalExecutable,
  getNoVotePercentage,
  getProposalTimeRemaining,
  getUserVote,
  getYesVotePercentage,
} from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { CloseSmall } from '~/design-system/icons/close-small';
import { TickSmall } from '~/design-system/icons/tick-small';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { TabGroup } from '~/design-system/tab-group';

import { Execute } from '~/partials/active-proposal/execute';

import { cachedFetchSpace } from '../space/[id]/cached-fetch-space';
import { AcceptOrRejectEditor } from './accept-or-reject-editor';
import { AcceptOrRejectMember } from './accept-or-reject-member';
import {
  ActiveProposalsForSpacesWhereEditor,
  getActiveProposalsForSpacesWhereEditor,
} from './fetch-active-proposals-in-editor-spaces';
import { fetchProposedEditorForProposal } from './fetch-proposed-editor';
import { fetchProposedMemberForProposal } from './fetch-proposed-member';
import { PersonalHomeDashboard } from './personal-home-dashboard';

const TABS = ['For You', 'Unpublished', 'Published', 'Following', 'Activity'] as const;

type Props = {
  header: React.ReactNode;
  acceptedProposalsCount: number;
  proposalType?: 'membership' | 'content';
  connectedAddress?: string;
};

export async function Component({ header, acceptedProposalsCount, proposalType, connectedAddress }: Props) {
  return (
    <>
      <div className="mx-auto max-w-[880px]">
        {header}
        <PersonalHomeNavigation />
        <PersonalHomeDashboard
          proposalsList={
            <React.Suspense
              key={`${proposalType}-${connectedAddress}`}
              fallback={
                <div className="space-y-2">
                  <LoadingSkeleton />
                  <LoadingSkeleton />
                  <LoadingSkeleton />
                </div>
              }
            >
              <PendingProposals connectedAddress={connectedAddress} proposalType={proposalType} />
            </React.Suspense>
          }
          acceptedProposalsCount={acceptedProposalsCount}
        />
      </div>
    </>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="space-y-4 rounded-lg border border-grey-02 p-4">
      <div className="space-y-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-5 w-48" />
    </div>
  );
}

function NoActivity() {
  return <p className="mb-4 text-body text-grey-04">You have no pending requests or proposals.</p>;
}

function PersonalHomeNavigation() {
  return (
    <React.Suspense fallback={null}>
      <TabGroup
        tabs={TABS.map(label => {
          const href = label === 'For You' ? `/home` : `/home/${label.toLowerCase()}`;
          const disabled = label === 'For You' ? false : true;

          return {
            href,
            label,
            disabled,
          };
        })}
        className="mt-8"
      />
    </React.Suspense>
  );
}

type PendingProposalsProps = {
  proposalType?: 'membership' | 'content';
  connectedAddress?: string;
};

async function PendingProposals({ proposalType, connectedAddress }: PendingProposalsProps) {
  const [activeProposals, profile] = await Promise.all([
    getActiveProposalsForSpacesWhereEditor(connectedAddress, proposalType),
    connectedAddress ? fetchProfile({ address: connectedAddress }) : null,
  ]);

  if (activeProposals.proposals.length === 0) {
    return <NoActivity />;
  }

  const user =
    profile || connectedAddress
      ? {
          address: connectedAddress,
          avatarUrl: profile?.avatarUrl ?? undefined,
        }
      : null;

  return (
    <div className="space-y-2">
      {activeProposals.proposals.map(proposal => {
        switch (proposal.type) {
          case 'ADD_MEMBER':
          case 'REMOVE_MEMBER':
            return <PendingMembershipProposal key={proposal.id} proposal={proposal} user={user} />;
          default:
            // We encapsulate editor, subspace, and content proposals in this pending content proposal
            return <PendingContentProposal key={proposal.id} proposal={proposal} user={user} />;
        }
      })}
    </div>
  );
}

type PendingMembershipProposalProps = {
  proposal: ActiveProposalsForSpacesWhereEditor['proposals'][number];
  user: {
    address: string | undefined;
    avatarUrl: string | undefined;
  } | null;
};

async function PendingMembershipProposal({ proposal }: PendingMembershipProposalProps) {
  const [proposedMember, space] = await Promise.all([
    fetchProposedMemberForProposal(proposal.id),
    cachedFetchSpace(proposal.space.id),
  ]);

  if (!proposedMember || !space) {
    return null;
  }

  const proposalName = `${proposal.type === 'ADD_MEMBER' ? 'Add' : 'Remove'} ${
    proposedMember.name ?? proposedMember.address ?? proposedMember.id
  } as member`;

  const ProfileHeader = proposedMember.profileLink ? (
    <Link href={proposedMember.profileLink} className="w-full">
      <div className="flex items-center justify-between">
        <div className="text-smallTitle">{proposalName}</div>
        <div className="relative h-5 w-5 overflow-hidden rounded-full">
          <Avatar avatarUrl={proposedMember.avatarUrl} value={proposedMember.id} size={20} />
        </div>
      </div>
    </Link>
  ) : (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <div className="text-smallTitle">{proposalName}</div>
        <div className="relative h-5 w-5 overflow-hidden rounded-full">
          <Avatar avatarUrl={proposedMember.avatarUrl} value={proposedMember.id} size={20} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 rounded-lg border border-grey-02 p-4">
      <div className="space-y-2">
        {ProfileHeader}

        <Link
          href={NavUtils.toSpace(proposal.space.id)}
          className="flex items-center gap-1.5 text-breadcrumb text-grey-04"
        >
          <div className="inline-flex items-center gap-1.5 transition-colors duration-75 hover:text-text">
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <Image
                src={getImagePath(space.entity?.image ?? PLACEHOLDER_SPACE_IMAGE)}
                alt={`Cover image for space ${space.entity?.name ?? space.id}`}
                layout="fill"
                objectFit="cover"
              />
            </div>
            <p>{space.entity?.name}</p>
          </div>
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-metadataMedium">1 vote required</p>

        <AcceptOrRejectMember
          onchainProposalId={proposal.onchainProposalId}
          membershipContractAddress={space.membershipAddress}
        />
      </div>
    </div>
  );
}

async function getMembershipProposalName(
  type: 'ADD_EDITOR' | 'ADD_MEMBER' | 'REMOVE_EDITOR' | 'REMOVE_MEMBER',
  proposal: ActiveProposalsForSpacesWhereEditor['proposals'][number]
) {
  const profile = await (type === 'ADD_EDITOR' || type === 'ADD_MEMBER'
    ? fetchProfile({ address: proposal.createdBy.address })
    : fetchProposedEditorForProposal(proposal.id));

  switch (type) {
    case 'ADD_EDITOR': {
      return `Add ${profile.name ?? profile.address} as editor`;
    }
    case 'ADD_MEMBER':
      return `Add ${profile.name ?? profile.address} as member`;
    case 'REMOVE_EDITOR':
      return `Remove ${profile.name ?? profile.address} as editor`;
    case 'REMOVE_MEMBER':
      return `Remove ${profile.name ?? profile.address} as member`;
  }
}

async function PendingContentProposal({ proposal, user }: PendingMembershipProposalProps) {
  const space = await cachedFetchSpace(proposal.space.id);

  if (!space) {
    // @TODO: Should never happen but we should error handle
    return null;
  }

  const proposalName = await (async () => {
    switch (proposal.type) {
      case 'ADD_EDIT':
        return proposal.name;
      case 'ADD_EDITOR':
      case 'REMOVE_EDITOR':
        return await getMembershipProposalName(proposal.type, proposal);
      case 'ADD_SUBSPACE':
      case 'REMOVE_SUBSPACE':
        return proposal.name;
      default:
        throw new Error('Unsupported proposal type');
    }
  })();

  const connectedAddress = (await cookies()).get(WALLET_ADDRESS)?.value;

  const votes = proposal.proposalVotes.nodes;
  const votesCount = proposal.proposalVotes.totalCount;

  const isProposalDone = getIsProposalEnded(proposal.status, proposal.endTime);
  const yesVotesPercentage = getYesVotePercentage(votes, votesCount);
  const noVotesPercentage = getNoVotePercentage(votes, votesCount);
  const isProposalEnded = getIsProposalEnded(proposal.status, proposal.endTime);
  const isProposalExecutable = getIsProposalExecutable(proposal, yesVotesPercentage);
  const userVote = connectedAddress ? getUserVote(votes, connectedAddress) : undefined;
  const { hours, minutes } = getProposalTimeRemaining(proposal.endTime);

  return (
    <div className="flex w-full flex-col gap-4 rounded-lg border border-grey-02 p-4">
      <Link href={NavUtils.toProposal(proposal.space.id, proposal.id)}>
        <div className="text-smallTitle">{proposalName}</div>
      </Link>
      <div className="flex w-full items-center gap-1.5 text-breadcrumb text-grey-04">
        <div className="inline-flex items-center gap-3 text-breadcrumb text-grey-04">
          <div className="inline-flex items-center gap-1.5 transition-colors duration-75 hover:text-text">
            <span className="relative h-3 w-3 overflow-hidden rounded-full">
              <Avatar avatarUrl={proposal.createdBy.avatarUrl} value={proposal.createdBy.id} />
            </span>
            <p>{proposal.createdBy.name ?? proposal.createdBy.id}</p>
          </div>
        </div>
      </div>
      <div className="flex w-full flex-col gap-4">
        <div className="flex items-center gap-2 text-metadataMedium">
          {userVote?.vote === 'ACCEPT' ? (
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <Avatar avatarUrl={user?.avatarUrl} value={user?.address} />
            </div>
          ) : (
            <div className="inline-flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
              <TickSmall />
            </div>
          )}
          <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
            <div className="absolute bottom-0 left-0 top-0 bg-green" style={{ width: `${yesVotesPercentage}%` }} />
          </div>
          <p>{yesVotesPercentage}%</p>
        </div>
        <div className="flex items-center gap-2 text-metadataMedium">
          {userVote?.vote === 'REJECT' ? (
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <Avatar avatarUrl={user?.avatarUrl} value={user?.address} />
            </div>
          ) : (
            <div className="inline-flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
              <CloseSmall />
            </div>
          )}
          <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
            <div className="absolute bottom-0 left-0 top-0 bg-red-01" style={{ width: `${noVotesPercentage}%` }} />
          </div>
          <p>{noVotesPercentage}%</p>
        </div>
      </div>
      <div className="flex w-full items-center justify-between">
        <p className="text-metadataMedium">{`${hours}h ${minutes}m remaining`}</p>

        {process.env.NODE_ENV === 'development' && isProposalDone && (
          <Execute
            contractAddress={space?.mainVotingAddress as `0x${string}`}
            onchainProposalId={proposal.onchainProposalId}
          >
            Execute
          </Execute>
        )}

        {(proposal.type === 'ADD_EDITOR' || proposal.type === 'REMOVE_EDITOR') && !userVote && (
          <AcceptOrRejectEditor
            onchainProposalId={proposal.onchainProposalId}
            isProposalEnded={isProposalEnded}
            isProposalExecutable={isProposalExecutable}
            status={proposal.status}
            userVote={userVote}
            // We know that the space isn't null here, so casting is safe. If the space
            // doesn't exist we redirect the user. Eventually every space with governance
            // will have a main voting plugin address
            // @TODO(migration): This address will be different for the personal space plugin
            votingContractAddress={space?.mainVotingAddress as `0x${string}`}
          />
        )}
      </div>
    </div>
  );
}

// const topics: { icon?: React.ReactNode; label: string; href: string }[] = [
//   { icon: <VideoSmall />, label: 'Videos', href: '/' },
//   { icon: <InfoSmall />, label: 'Guides and posts', href: '/' },
// ];

// const LearnMore = () => {
//   return (
//     <div className="flex flex-wrap gap-2">
//       {topics.map(topic => (
//         <Link
//           href={topic.href}
//           key={topic.label}
//           className="inline-flex items-center gap-1 rounded bg-white p-1 text-breadcrumb"
//         >
//           {topic.icon && <span className="inline-block scale-[0.75]">{topic.icon}</span>}
//           <span>{topic.label}</span>
//         </Link>
//       ))}
//     </div>
//   );
// };

// const JoinSpaces = () => {
//   const { spaces } = useSpaces();

//   return (
//     <div className="flex flex-wrap gap-2 pr-16">
//       {recommendedSpaces.map(spaceId => {
//         const space = spaces.find(space => space.id === spaceId);

//         if (!space) return null;

//         const spaceImage = space.spaceConfig?.image ? getImagePath(space.spaceConfig?.image) : PLACEHOLDER_SPACE_IMAGE;

//         return (
//           <Link
//             key={space.id}
//             href={NavUtils.toSpace(space.id)}
//             className="inline-flex items-center gap-1.5 rounded bg-white p-1 text-breadcrumb"
//           >
//             <span className="relative h-3 w-3 overflow-hidden rounded-sm">
//               <img src={spaceImage} className="absolute inset-0 h-full w-full object-cover object-center" alt="" />
//             </span>
//             <span>{space.spaceConfig?.name ?? space.id}</span>
//           </Link>
//         );
//       })}
//     </div>
//   );
// };

// const Notices = () => {
//   return (
//     <div className="mb-2 space-y-2">
//       <ClientOnly>
//         <Notice
//           id="welcomeToYourHome"
//           color="grey"
//           title="Welcome to your home"
//           description="Your area to see any proposals, member requests, editor requests and all general activity across the spaces you are involved in."
//           media={<img src="/home.png" alt="" className="-mb-12" />}
//         />
//         {/* <Notice
//           id="findOrCreateCompanySpace"
//           color="green"
//           title="Find / create your company space"
//           description="Join your company space as a member or editor, or create it if it doesn’t exist."
//           element={<FindOrCreateCompanySpace />}
//           media={<img src="/company.png" alt="" className="-mb-12" />}
//         /> */}
//         <Notice
//           id="findSpacesToJoin"
//           color="orange"
//           title="Find spaces to join"
//           description="Discover and join spaces where you can actively engage with the topics and issues that captivate your interest."
//           element={<JoinSpaces />}
//         />
//         {/* <Notice
//           id="learnMore"
//           color="purple"
//           title="Want to learn more?"
//           description="Watch videos and read our guides to help you get to grips with the fundamentals of using and contributing to Geo."
//           element={<LearnMore />}
//           media={<img src="/videos.png" alt="" />}
//         /> */}
//       </ClientOnly>
//     </div>
//   );
// };

// type NoticeProps = {
//   id: string;
//   color: 'grey' | 'blue' | 'green' | 'orange' | 'purple';
//   title: string;
//   description: string;
//   element?: React.ReactNode;
//   media?: React.ReactNode;
// };

// const Notice = ({ id, color, title, description, element, media }: NoticeProps) => {
//   const [dismissedNotices, setDismissedNotices] = useAtom(dismissedNoticesAtom);

//   const classNames = cva('relative flex gap-4 overflow-clip rounded-lg p-4', {
//     variants: {
//       color: {
//         grey: 'bg-gradient-grey',
//         blue: 'bg-gradient-blue',
//         green: 'bg-gradient-green',
//         orange: 'bg-gradient-orange',
//         purple: 'bg-gradient-purple',
//       },
//     },
//   });

//   const handleDismissNotice = React.useCallback(() => {
//     const newDismissedNotices = [...dismissedNotices, id];
//     setDismissedNotices(newDismissedNotices);
//   }, [id, dismissedNotices, setDismissedNotices]);

//   if (dismissedNotices.includes(id)) return null;

//   return (
//     <div id={id} className={classNames({ color })}>
//       <div>
//         <div className="text-smallTitle">{title}</div>
//         <div className="mt-2">{description}</div>
//         {element && <div className="mt-2">{element}</div>}
//       </div>
//       {media && <div className="-mx-4 -mb-4">{media}</div>}
//       <div>
//         <button onClick={handleDismissNotice} className="rounded border p-1">
//           <Close />
//         </button>
//       </div>
//     </div>
//   );
// };

// type SidebarProps = {
//   acceptedProposalsCount: number;
// };

// const Sidebar = ({ acceptedProposalsCount }: SidebarProps) => {
//   return (
//     <div className="space-y-2">
//       <Activity
//         label="My proposals"
//         activities={[
//           { icon: <InProgressSmall />, label: 'In progress', count: 0 },
//           { icon: <CheckCircleSmall />, label: 'Accepted', count: acceptedProposalsCount },
//           { icon: <CheckCloseSmall />, label: 'Rejected', count: 0 },
//         ]}
//       />
//       <Activity
//         label="Proposals I’ve voted on"
//         activities={[
//           { icon: <CheckCircleSmall />, label: 'Accepted', count: 0 },
//           { icon: <CheckCloseSmall />, label: 'Rejected', count: 0 },
//         ]}
//       />
//       <Activity
//         label="I have accepted"
//         activities={[
//           { icon: <Member />, label: 'Members', count: 0 },
//           { icon: <EditSmall />, label: 'Editors', count: 0 },
//         ]}
//       />
//     </div>
//   );
// };

// type ActivityProps = {
//   label: string;
//   activities: { icon?: React.ReactNode; label: string; count: number }[];
// };

// const Activity = ({ label = '', activities = [] }: ActivityProps) => {
//   return (
//     <div className="rounded-lg border border-grey-02 p-4">
//       <div className="text-breadcrumb text-grey-04">{label}</div>
//       {activities.map(({ icon, label, count }) => (
//         <div key={label} className="mt-2 flex items-center justify-between text-metadataMedium">
//           <div className="inline-flex items-center gap-2">
//             {icon && <div>{icon}</div>}
//             <div>{label}</div>
//           </div>
//           <div>{count}</div>
//         </div>
//       ))}
//     </div>
//   );
// };
