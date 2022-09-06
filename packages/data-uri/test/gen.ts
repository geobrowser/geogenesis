import {keySort, Value} from '../lib';

export class Gen {
  rng: () => number;

  constructor(rng: () => number) {
    this.rng = rng;
  }

  genValue = (maxDepth: number): Value => {
    switch (this.genInt({min: 0, max: maxDepth > 0 ? 6 : 4})) {
      case 0:
        return null;
      case 1:
        return this.genBool();
      case 2:
        return this.genNumber();
      case 3:
        return this.genString();
      case 4:
        return this.genBytes();
      case 5:
        return this.genList(maxDepth - 1);
      case 6:
        return this.genMap(maxDepth - 1);
      default:
        throw 'unreachable';
    }
  };

  genMap = (maxDepth: number): {[key: string]: Value} => {
    const length = this.genInt({min: 0, max: 4});
    const keyLength = this.genInt({min: 1, max: 5});
    const genKey = () =>
      String.fromCodePoint(
        ...Array.from({length: keyLength}, _ => this.genASCII())
      );
    const keys = Array.from({length}, _ => genKey()).sort(keySort);
    return Object.fromEntries(keys.map(k => [k, this.genValue(maxDepth)]));
  };

  genList = (maxDepth: number): Array<Value> => {
    const length = this.genInt({min: 0, max: 4});
    return Array.from({length}, _ => this.genValue(maxDepth));
  };

  genBytes = (): Uint8Array => {
    const len = this.genInt({min: 0, max: 128});
    const genByte = () => this.genInt({min: 0, max: 255});
    const bytes = new Uint8Array(len);
    for (let i = 0; i < bytes.length; i++) bytes[i] = genByte();
    return bytes;
  };

  genString = (): string => {
    const length = this.genInt({min: 0, max: 128});
    return String.fromCodePoint(...Array.from({length}, _ => this.genASCII()));
  };

  genNumber = (): number =>
    this.genInt({
      min: Number.MIN_SAFE_INTEGER,
      max: Number.MAX_SAFE_INTEGER,
    });

  genBool = (): boolean => this.rng() > 0.5;

  genASCII = (): number => this.genInt({min: 32, max: 126});

  genInt = (range: Range): number =>
    Math.floor(this.rng() * (range.max - range.min + 1) + range.min);
}

interface Range {
  min: number;
  max: number;
}
