import { fetchSpacesWhereEditor } from '~/core/io/subgraph/fetch-spaces-where-editor';

export default async function Page() {
  // const entity = await fetchEntity({ id: 'da6e0351601f4dd5b89c6a3b6544fd03' });
  // const space = await fetchSpace({ id: 'ab7d4b9e02f840dab9746d352acb0ac6' });
  // const spaces = await fetchSpaces();
  const spaces = await fetchSpacesWhereEditor('0x35483105944CD199BD336D6CEf476ea20547a9b5');
  console.log('space', spaces);

  return (
    <div>
      <h1>Page</h1>
    </div>
  );
}
