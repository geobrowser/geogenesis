import { Duration, Effect, Schedule } from 'effect';

export function retryEffect<T>(effect: Effect.Effect<T, Error>) {
  return Effect.retry(
    effect,
    Schedule.exponential(100).pipe(
      Schedule.jittered,
      Schedule.compose(Schedule.elapsed),
      // Retry for 3 seconds.
      Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.seconds(3)))
    )
  );
}
