import { BrowserStore } from '../src/lib/metadata/browser-store.js';
import { parseImport } from '../src/lib/metadata/imports.js';
document.querySelector('#run').onclick = async () => {
  const result = document.querySelector('#result'); result.textContent = 'Running…';
  let first, second; const databaseName = 'scholar-rank-selftest-' + crypto.randomUUID();
  const database = { open: () => indexedDB.open(databaseName,1) };
  let settings = {};
  const storage = { get: async defaults => ({ ...defaults,...settings }), set: async patch => { settings = {...settings,...patch}; } };
  try {
    first = await new BrowserStore({database,storage}).open();
    await first.configure({directEnabled:true,agentEnabled:false,dailyLimit:1});
    first.importMetrics(parseImport([{type:'conference',name:'Synthetic Browser Storage Test',abbr:'TEST',year:2026,source:'Synthetic regression fixture',ccf:'C'}]),'Test');
    first.saveResult('synthetic',{title:'Synthetic publication'},{status:'partial',identity:{name:'Synthetic source'},metrics:[],missing:['ccf'],badges:[]});
    await first.flush();
    if (!await first.reserveAgentCall(1)) throw Error('Call reservation failed');
    first.db.close();
    second = await new BrowserStore({database,storage}).open();
    if (!second.cached('synthetic')) throw Error('Cache did not survive restart');
    if (second.records({status:'missing'}).length !== 1) throw Error('Missing records did not survive restart');
    if (second.venueRows().length !== 1) throw Error('Imported rankings did not survive restart');
    if (await second.reserveAgentCall(1)) throw Error('Daily budget did not survive restart');
    if (JSON.stringify(second.state).includes('srDirectConfig')) throw Error('Settings leaked into metadata');
    result.textContent = 'PASS: real IndexedDB cache, missing records, ranking imports and daily budget survived restart. No local backend was used.';
  } catch (error) { result.textContent = 'FAIL: ' + error.message; }
  finally { first?.db.close(); second?.db.close(); indexedDB.deleteDatabase(databaseName); }
};
