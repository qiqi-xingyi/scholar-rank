import { createHash } from 'node:crypto';
export { keyName, issn, doi, requestInput, csv, parseImport } from '../src/lib/metadata/imports.js';
export function requestKey(input) { return createHash('sha256').update(JSON.stringify(input)).digest('hex'); }
