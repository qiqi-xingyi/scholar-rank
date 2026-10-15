import { readFileSync } from 'node:fs';
import '../src/lib/normalize.js';
import '../src/lib/ranking.js';
import { requestKey } from './imports.mjs';
import { createResolverClass } from '../src/lib/metadata/resolver.js';
const data = Object.fromEntries(['ccf','core','journals','aliases'].map(name => [name, JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url)))]));
export const Resolver = createResolverClass(data, globalThis.SRRanking, { keyOf: requestKey });
export function configOf(store) { return { agentEnabled: false, deepseekModel: 'deepseek-flash', dailyLimit: 20, ...store.get('config', {}) }; }
