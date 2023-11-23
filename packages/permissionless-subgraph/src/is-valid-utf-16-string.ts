// implementation of isWellFormed in core-js
// https://github.com/zloirock/core-js/blob/ebecc0f830f47ad21d4736aa09decaeabbd4a3c7/packages/core-js/modules/es.string.is-well-formed.js#L12
export function isWellFormed(str: string): boolean {
  if (typeof str !== 'string') {
    return false
  }

  let length = str.length
  for (var i = 0; i < length; i++) {
    let charCode = str.charCodeAt(i)
    // single UTF-16 code unit
    if ((charCode & 0xf800) !== 0xd800) continue
    // unpaired surrogate
    if (
      charCode >= 0xdc00 ||
      ++i >= length ||
      (str.charCodeAt(i) & 0xfc00) !== 0xdc00
    )
      return false
  }
  return true
}

export function cleanString(input: string): string {
  let output = ''
  for (let i = 0; i < input.length; i++) {
    if (
      input.charCodeAt(i) <= 127 ||
      (input.charCodeAt(i) >= 160 && input.charCodeAt(i) <= 255)
    ) {
      output += input.charAt(i)
    }
  }
  return output
}
