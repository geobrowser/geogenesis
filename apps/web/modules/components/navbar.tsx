import styled from '@emotion/styled';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSpaces } from '~/modules/state/use-spaces';
import { intersperse, titleCase } from '~/modules/utils';
import { SYSTEM_IDS, ZERO_WIDTH_SPACE } from '../constants';
import { Breadcrumb } from '../design-system/breadcrumb';
import { ChevronDownSmall } from '../design-system/icons/chevron-down-small';
import { GeoLogoLarge } from '../design-system/icons/geo-logo-large';
import { Spacer } from '../design-system/spacer';
import { usePageName } from '../state/use-page-name';
import { Dictionary } from '../types';
import { EditToggle } from './edit-toggle';
import { ExternalLink } from './external-link';

const Header = styled.header(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${theme.space * 2}px ${theme.space * 4}px`,
  backgroundColor: theme.colors.white,
  boxShadow: `0 1px 21px ${theme.colors['grey-02']}`,

  '@media (max-width: 1920px)': {
    padding: `${theme.space}px ${theme.space * 4}px`,
  },

  paddingRight: theme.space * 6,
}));

const BreadcrumbsContainer = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

const NavigationItemsContainer = styled.div({
  display: 'flex',
  alignItems: 'center',
});

const Row = styled.div({
  display: 'flex',
  alignItems: 'center',
});

type GetComponentRouteConfig = {
  components: string[];
  index: number;
  spaceNames: Dictionary<string, string>;
  spaceImages: Dictionary<string, string>;
  pageName: string;
};

type ComponentRoute = {
  title: string;
  path: string;
  img: string | null;
};

function getComponentRoute({
  components,
  index,
  spaceNames,
  spaceImages,
  pageName,
}: GetComponentRouteConfig): ComponentRoute {
  const component = components[index];
  const path = components.slice(0, index + 1).join('/');

  switch (components[1]) {
    case 'space':
      switch (index) {
        case 1:
          return { path: '/spaces', title: 'Spaces', img: '/spaces.png' };
        case 2:
          return { path, title: spaceNames[component] ?? ZERO_WIDTH_SPACE, img: spaceImages[component] ?? '' };
        case 3:
          return { path, title: pageName || titleCase(component), img: '/facts.svg' };
      }
  }

  return { path, title: titleCase(component), img: '/spaces.png' };
}

export function Navbar() {
  const router = useRouter();
  const asPath = router.asPath;
  const components = asPath.split('/');
  const { spaces } = useSpaces();
  const { pageName } = usePageName();

  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceImages = Object.fromEntries(spaces.map(space => [space.id, space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE]]));

  return (
    <Header>
      <NavigationItemsContainer>
        <Link href="/" passHref>
          <a>
            <GeoLogoLarge />
          </a>
        </Link>
        <Spacer width={32} />
        <BreadcrumbsContainer>
          {intersperse(
            components.map((component, index) => {
              if (index === 0) return null; // skip the "Geo" part
              const { path, title, img } = getComponentRoute({ components, index, spaceNames, spaceImages, pageName });

              return (
                <Breadcrumb key={index} href={path} img={img}>
                  {title}
                </Breadcrumb>
              );
            }),
            ({ index }) => {
              if (index === 1) return null; // skip the "Geo" part
              return (
                <span key={`separator-${index}`} style={{ rotate: '270deg' }}>
                  <ChevronDownSmall color="grey-03" />
                </span>
              );
            }
          )}
        </BreadcrumbsContainer>
      </NavigationItemsContainer>

      <Row>
        <DiscordLink />
        <Spacer width={16} />
        <EditToggle spaceId={components?.[2] ?? ''} />
      </Row>
    </Header>
  );
}

const DiscordLinkContainer = styled(Row)(({ theme }) => ({
  ...theme.typography.button,
  display: 'flex',
  alignItems: 'center',
  color: theme.colors['grey-04'],
  transition: '0.15s ease-in-out all',

  ':hover': {
    color: theme.colors.text,
  },
}));

function DiscordLink() {
  return (
    <ExternalLink href="https://discord.gg/axFtvyxRNQ">
      <DiscordLinkContainer>
        <DiscordIcon />
        <Spacer width={8} />
        <p>Geo Discord</p>
      </DiscordLinkContainer>
    </ExternalLink>
  );
}

function DiscordIcon() {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M13.5536 1.83749C12.5034 1.34605 11.3924 0.997129 10.2498 0.799988C10.0945 1.08442 9.95346 1.37645 9.82732 1.67499C8.6148 1.48936 7.38109 1.48936 6.16857 1.67499C6.04126 1.37614 5.89857 1.08409 5.74107 0.799988C4.59829 0.997429 3.48714 1.34721 2.43732 1.83999C0.351073 4.99686 -0.215177 8.07499 0.0679479 11.11C1.28716 12.0304 2.65685 12.7323 4.11607 13.1844C4.44429 12.7332 4.73445 12.2555 4.98357 11.7562C4.50948 11.5759 4.05245 11.3536 3.61795 11.0919C3.73232 11.0069 3.8442 10.9181 3.95232 10.8269C6.58545 12.0581 9.44545 12.0581 12.0467 10.8269C12.1567 10.9181 12.2686 11.0069 12.3817 11.0919C11.9464 11.354 11.4885 11.5768 11.0136 11.7575C11.2625 12.2568 11.5527 12.7345 11.8811 13.1856C13.3415 12.7339 14.7121 12.0316 15.9317 11.11C16.2642 7.59186 15.3642 4.54186 13.5536 1.83749ZM5.3417 9.24311C4.5517 9.24311 3.9042 8.50561 3.9042 7.60686C3.9042 6.70811 4.53857 5.96936 5.3417 5.96936C6.14482 5.96936 6.7942 6.70749 6.7792 7.60686C6.7817 8.50561 6.14607 9.24311 5.3417 9.24311ZM10.6579 9.24311C9.86732 9.24311 9.22045 8.50561 9.22045 7.60686C9.22045 6.70811 9.85482 5.96936 10.6579 5.96936C11.4611 5.96936 12.1098 6.70749 12.0954 7.60686C12.0961 8.50561 11.4617 9.24311 10.6579 9.24311Z"
        fill="currentColor"
      />
    </svg>
  );
}
