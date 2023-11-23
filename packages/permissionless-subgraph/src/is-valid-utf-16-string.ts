export function isValidUtf16String(str: string): boolean {
  let i = 0
  let len = str.length

  while (i < len) {
    let char = str.charCodeAt(i)

    i++

    // Might be surrogate pair...
    if (char >= 0xd800) {
      // First half of surrogate pair
      if (char <= 0xdbff) {
        // End of string
        if (i === len) {
          return false
        } else {
          let next = str.charCodeAt(i)

          // No second half
          if (next < 0xdc00 || next > 0xdfff) {
            return false
          }
        }

        // Second half of surrogate pair
      } else if (char <= 0xdfff) {
        return false
      }
    }
  }

  return true
}
