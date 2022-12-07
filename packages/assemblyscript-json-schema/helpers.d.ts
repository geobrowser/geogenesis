/**
 * This file contains helpers for type-checking in plain ts.
 */

type i32 = number

declare module 'assemblyscript-json/assembly' {
	export namespace JSON {
		interface Value {
			isObj(value: JSON.Value): boolean
		}
		interface Obj extends Value {
			getString(key: string): JSON.Str | null
			getObj(key: string): JSON.Obj | null
			getNum(key: string): JSON.Num | null
			getBool(key: string): JSON.Num | null
			getArr(key: string): JSON.Arr | null
		}
		interface Str extends Value {
			valueOf(): string
		}
		interface Num extends Value {
			valueOf(): number
		}
		interface Bool extends Value {
			valueOf(): boolean
		}
		interface Arr extends Value {
			valueOf(): JSON.Value[]
		}
	}
}
