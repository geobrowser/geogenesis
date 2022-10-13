import { interval as interval$, Observable, switchMap } from 'rxjs';
import { Identifable } from '../types';

interface ISyncServiceConfig<T> {
  interval: number;
  callback: () => Promise<T>;
}

export function createSyncService<T>({ interval = 5000, callback }: ISyncServiceConfig<T>): Observable<T> {
  return interval$(interval).pipe(switchMap(callback));
}

export function dedupe<T extends Identifable>(local: T[], server: T[]) {
  const localIds = new Set(local.map(triple => triple.id));
  const filteredServer = server.filter(triple => !localIds.has(triple.id));
  return [...local, ...filteredServer];
}
