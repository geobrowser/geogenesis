import { useEffect, useState } from 'react';

type QueryArgs = {
  queryFn: any;
  [key: string]: any;
};

// Can be used in place of `useQuery` for local development
export const useDevQuery = (args: QueryArgs) => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { queryFn } = args;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const result = await queryFn();
        setData(result);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [queryFn]);

  return { data, isLoading, isFetched: isLoading } as const;
};
