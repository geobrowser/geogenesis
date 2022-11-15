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

const Header = styled.header(({ theme }) => ({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  padding: theme.space * 4,
  backgroundColor: theme.colors.white,
  boxShadow: `0 1px 21px ${theme.colors['grey-02']}`,

  '@media (max-width: 1920px)': {
    padding: theme.space * 3,
  },
}));

const BreadcrumbsContainer = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
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
    </Header>
  );
}
