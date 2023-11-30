export function invariant<T>(condition: T, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
