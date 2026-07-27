declare module "@provableio/provable-core" {
  export type ProvableConfig = {
    serverSeed: string;
    clientSeed: string;
    nonce: number;
    cursor: number;
  };

  export type ProvableGenerator = {
    floats(count?: number): number[];
    ints(count: number, max: number, min?: number): number[];
    state(): ProvableConfig & { serverHash: string };
  };

  export const Provable: (
    emit?: (config: ProvableConfig) => unknown,
  ) => (config: ProvableConfig) => ProvableGenerator;
}
