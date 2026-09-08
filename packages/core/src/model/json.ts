/** Plain JSON value. Used for `metadata` bags and harness-specific option blobs. */
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = Record<string, JsonValue>
