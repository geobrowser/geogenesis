import { fetchSpace } from '~/core/io/subgraph';

export default async function Test() {
  const test = await fetchSpace({ id: 'ab7d4b9e02f840dab9746d352acb0ac6' });
  console.log('entity', test?.spaceConfig);

  return <div>Hello world</div>;
}
