// import { css, Global } from '@emotion/react';
// import styled from '@emotion/styled';
import { AppProps } from 'next/app';
import Head from 'next/head';
import { Navbar } from '~/modules/components/navbar/navbar';
// import { colors } from '~/modules/design-system/theme/colors';
import { Providers } from '~/modules/providers';
// import { FlowBar } from '~/modules/components/flow-bar';
// import { useActionsStore } from '~/modules/action';
// import { useRouter } from 'next/router';
// import { Analytics } from '@vercel/analytics/react';

import 'modern-normalize';
import '../styles/styles.css';

// const globalStyles = css`
//   html {
//     overflow-y: overlay;
//   }

//   body {
//     font-family: Calibre, sans-serif;
//     text-rendering: 'optimizeLegibility';
//     background-color: ${colors.light.bg};
//   }
// `;

// const Layout = styled.main(props => ({
//   paddingTop: props.theme.space * 10,
//   paddingBottom: props.theme.space * 20,
//   maxWidth: 1200,
//   margin: '0 auto',

//   '@media (max-width: 1200px)': {
//     padding: `${props.theme.space * 10}px 2ch 4ch 2ch`,
//   },
// }));

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <Providers>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Geo Genesis</title>
      </Head>
      {/* <Global styles={globalStyles} /> */}
      <Navbar />
      {/* <Layout> */}
      <Component {...pageProps} />
      {/* <Analytics /> */}
      {/* </Layout> */}
      {/* <GlobalFlowBar /> */}
    </Providers>
  );
}

// const FlowbarContainer = styled.div({
//   position: 'relative',
//   display: 'flex',
//   flexDirection: 'column',
//   alignItems: 'center',
// });

// function GlobalFlowBar() {
//   const router = useRouter();
//   const { id: spaceId } = router.query as { id: string | undefined };
//   const { actions, publish } = useActionsStore(spaceId);

//   return (
//     <FlowbarContainer>
//       <FlowBar actions={actions} onPublish={publish} spaceId={spaceId} />
//     </FlowbarContainer>
//   );
// }

export default MyApp;
