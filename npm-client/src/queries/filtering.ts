import { PublicKey, MemcmpFilter } from "@solana/web3.js";
import { BorshAccountsCoder } from "@coral-xyz/anchor";
import bs58 from "bs58";

export abstract class Criterion<T> {
  private offset: number;
  private size: number;
  private value?: T;

  constructor(offset: number, size: number) {
    this.offset = offset;
    this.size = size;
  }

  getOffset(): number {
    return this.offset;
  }

  getSize(): number {
    return this.size;
  }

  hasValue(): boolean {
    return this.value != undefined;
  }

  getValue(): T | undefined {
    return this.value;
  }

  setValue(value: T) {
    this.value = value;
  }

  abstract toBuffer(): Buffer;
}

export class BooleanCriterion extends Criterion<boolean> {
  constructor(offset: number) {
    super(offset, 1);
  }

  toBuffer(): Buffer {
    return Buffer.from(this.toBytes());
  }

  private toBytes(): Uint8Array {
    const value = this.getValue();
    return value == undefined ? Uint8Array.of() : Uint8Array.of(value ? 1 : 0);
  }
}

export class ByteCriterion extends Criterion<number> {
  constructor(offset: number) {
    super(offset, 1);
  }

  toBuffer(): Buffer {
    return Buffer.from(this.toBytes());
  }

  private toBytes(): Uint8Array {
    const value = this.getValue();
    return value == undefined ? Uint8Array.of() : Uint8Array.of(value);
  }
}

export class U16Criterion extends Criterion<number> {
  constructor(offset: number) {
    super(offset, 2);
  }

  toBuffer(): Buffer {
    return Buffer.from(this.toBytes());
  }

  private toBytes(): Uint8Array {
    const buffer = Buffer.alloc(2);
    const value = this.getValue();
    if (value != undefined) {
      buffer.writeUInt16LE(value, 0);
    }
    return buffer;
  }
}

export class PublicKeyCriterion extends Criterion<PublicKey> {
  constructor(offset: number) {
    super(offset, 32);
  }

  toBuffer(): Buffer {
    return Buffer.from(this.toBytes());
  }

  private toBytes(): Uint8Array {
    const value = this.getValue();
    return value == undefined ? Uint8Array.of() : value.toBytes();
  }
}

export function toFilters(
  accountName: string,
  ...criteria: Criterion<unknown>[]
): MemcmpFilter[] {
  type FilterData = { offset: number; size: number; buffer: Buffer };

  const filterData: FilterData[] = [
    {
      buffer: BorshAccountsCoder.accountDiscriminator(accountName),
      offset: 0,
      size: 8,
    },
  ].concat(
    criteria
      .filter((c) => c.hasValue())
      .sort((a, b) => a.getOffset() - b.getOffset())
      .map((c) => {
        return {
          buffer: c.toBuffer(),
          offset: c.getOffset(),
          size: c.getSize(),
        };
      }),
  );

  const filterDataIsContiguous = (a: FilterData, b: FilterData) => {
    return a.offset + a.size == b.offset;
  };

  const filters = [] as MemcmpFilter[];
  for (let i = 0, j = 0; i < filterData.length; i = j) {
    let buffer = filterData[i].buffer;
    for (j = i + 1; j < filterData.length; j++) {
      if (filterDataIsContiguous(filterData[i], filterData[j])) {
        buffer = Buffer.concat([buffer, filterData[j].buffer]);
      } else {
        break;
      }
    }
    filters.push(toFilter(buffer, filterData[i].offset));
  }
  return filters;
}

function toFilter(buffer: Buffer, offset: number): MemcmpFilter {
  return {
    memcmp: {
      offset: offset,
      bytes: bs58.encode(buffer),
    },
  };
}
