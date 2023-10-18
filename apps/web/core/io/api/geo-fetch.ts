export async function fetcher<T>(relativeUrl: string) {
  const url = new URL(relativeUrl, process.env.ENV_URL);

  const response = await fetch(url);
  return (await response.json()) as T;
}
