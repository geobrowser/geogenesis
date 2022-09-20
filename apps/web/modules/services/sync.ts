import { interval as interval$, Observable, switchMap } from 'rxjs';

interface ISyncServiceConfig<T> {
  interval: number;
  callback: () => Promise<T>;
}

export const createSyncService = <T>({ interval, callback }: ISyncServiceConfig<T>): Observable<T> => {
  return interval$(interval).pipe(switchMap(callback));
};
