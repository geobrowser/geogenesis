export function partition<T>(array: T[], predicate: (t: T) => boolean) {
  const trueArray: T[] = [];
  const falseArray: T[] = [];

  for (const item of array) {
    if (predicate(item)) {
      trueArray.push(item);
    } else {
      falseArray.push(item);
    }
  }

  return [trueArray, falseArray] as const;
}
