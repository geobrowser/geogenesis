import { Effect, Schedule } from 'effect';

export function retryEffect<T>(effect: Effect.Effect<T, Error>) {
  return Effect.retry(effect, Schedule.exponential(100).pipe(Schedule.jittered));
}
