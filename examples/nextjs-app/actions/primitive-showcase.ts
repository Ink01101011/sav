export interface PrimitiveShowcaseDTO {
  amount: bigint;
  token: symbol;
  rawPayload: unknown;
  passthrough: any;
  explicitNull: null;
  explicitUndefined: undefined;
  noReturn: void;
  enabled: true;
  disabled: false;
  buildNumber: 2;
}