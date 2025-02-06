import { useEffect, useState } from 'react';

// Can be used in place of `useQuery` for local development
export const useDevQuery = (queryFn: () => any) => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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

  return { data, isLoading };
};
