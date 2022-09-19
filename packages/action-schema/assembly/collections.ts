export function compactMap<T, U>(
  array: Array<T>,
  callbackfn: (value: T, index: i32, array: Array<T>) => U | null
): Array<U> {
  const result = new Array<U>()

  for (let i = 0; i < array.length; i++) {
    const mapped = callbackfn(array[i], i, array)

    if (mapped != null) {
      result.push(mapped)
    }
  }

  return result
}

export function mapOrNull<T, U>(
  array: Array<T>,
  callbackfn: (value: T, index: i32, array: Array<T>) => U | null
): Array<U> | null {
  const result = compactMap<T, U>(array, callbackfn)
  if (result.length != array.length) return null
  return result
}
