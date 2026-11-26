import { csvToJson, jsonToCsv, type DataResult, type JsonToCsvOptions } from '@lovert/core';

export function convertData(direction: 'csv-to-json' | 'json-to-csv', bytes: Uint8Array, options: JsonToCsvOptions): DataResult {
  return direction === 'csv-to-json' ? csvToJson(bytes) : jsonToCsv(bytes, options);
}
