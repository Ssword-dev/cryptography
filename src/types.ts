interface EncryptionOptions {
  input: string;
  key?: string;
}

interface EncryptionOptionsWithEncoding extends EncryptionOptions {
  encoding: BufferEncoding;
}

type AnyEncryptionOptions = EncryptionOptions &
  Partial<Omit<EncryptionOptionsWithEncoding, keyof EncryptionOptions>>;

interface HashFunction {
  (opts: AnyEncryptionOptions): string;
}
export type {
  AnyEncryptionOptions,
  HashFunction,
  EncryptionOptions,
  EncryptionOptionsWithEncoding,
};
