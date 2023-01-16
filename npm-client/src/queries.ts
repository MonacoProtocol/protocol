import { PublicKey, MemcmpFilter } from "@solana/web3.js";
import { BorshAccountsCoder } from "@project-serum/anchor";
import bs58 from "bs58";

abstract class Criterion<T> {
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

  abstract writeToBuffer(buffer: Buffer): number;
}

export class ByteCriterion extends Criterion<number> {
  constructor(offset: number) {
    super(offset, 1);
  }

  writeToBuffer(buffer: Buffer): number {
    const bytes = this.toBytes();
    Buffer.from(bytes).copy(buffer, this.getOffset(), 0, bytes.byteLength);
    return bytes.byteLength;
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

  writeToBuffer(buffer: Buffer): number {
    const bytes = this.toBytes();
    Buffer.from(bytes).copy(buffer, this.getOffset(), 0, bytes.byteLength);
    return bytes.byteLength;
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

  writeToBuffer(buffer: Buffer): number {
    const bytes = this.toBytes();
    Buffer.from(bytes).copy(buffer, this.getOffset(), 0, bytes.byteLength);
    return bytes.byteLength;
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
  const filters: MemcmpFilter[] = [];

  const criteriaSize = criteria
    .map((criterion) => criterion.getSize())
    .reduce((partialSum, a) => partialSum + a, 0);
  const buffer = Buffer.alloc(8 + criteriaSize);

  let filterIndex = 0;
  let filterLength = 0;

  BorshAccountsCoder.accountDiscriminator(accountName).copy(buffer, 0, 0, 8);
  filterLength = filterLength + 8;

  criteria.forEach((criterion) => {
    if (criterion.hasValue()) {
      filterLength += criterion.writeToBuffer(buffer);
    } else {
      if (filterLength > 0) {
        filters.push(toFilter(buffer, filterIndex, filterIndex + filterLength));
      }
      filterIndex = filterIndex + filterLength + criterion.getSize();
      filterLength = 0;
    }
  });
  if (filterLength > 0) {
    filters.push(toFilter(buffer, filterIndex, filterIndex + filterLength));
  }

  return filters;
}

function toFilter(
  buffer: Buffer,
  startIndex: number,
  endIndex: number,
): MemcmpFilter {
  return {
    memcmp: {
      offset: startIndex,
      bytes: bs58.encode(buffer.subarray(startIndex, endIndex)),
    },
  };
}
