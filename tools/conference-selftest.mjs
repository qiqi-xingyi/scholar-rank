/** Regressions from Scholar profiles: editions, incomplete acronyms and directory differences. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../src/lib/normalize.js';
import '../src/lib/ranking.js';
const read = n => JSON.parse(fs.readFileSync(new URL(`../src/data/${n}.json`, import.meta.url)));
const rank = new SRRanking(Object.fromEntries(['ccf', 'core', 'journals', 'aliases'].map(n => [n, read(n)])));
const cases = [
 ['2014 IEEE 28th International Parallel and Distributed Processing Symposium …', ['IPDPS','CCF B','CORE A']],
 ['2012 IEEE 18th Pacific Rim International Symposium on Dependable Computing …', ['PRDC','CORE C']],
 ['2011 Sixth International Conference on Availability, Reliability and …', ['ARES','CORE B']],
 ['2010 IEEE 34th Annual Computer Software and Applications Conference …', ['COMPSAC','CCF C','CORE B']],
 ['2011 Proceedings of 20th International Conference on Computer Communications and Networks', ['ICCCN','CCF C','CORE B']],
 ['2018 IEEE 38th International Conference on Distributed Computing Systems …', ['ICDCS','CCF B','CORE A']],
 ['2022 52nd Annual IEEE/IFIP International Conference on Dependable Systems …', ['DSN','CCF B','CORE A']],
 ['2023 IEEE International Conference on Quantum Computing and Engineering (QCE …', ['QCE']],
 ['Proceedings of Machine Learning and Systems 4, 251-264', ['MLSys']],
 ['ACM International Symposium on High Performance Distributed Computing', ['HPDC','CCF A','CORE A']],
 ['Proceedings of the 26th International Symposium on High-Performance Parallel …', ['HPDC','CCF A','CORE A']],
 ['Proceedings of the ACM International Conference on Supercomputing, 106-116', ['ICS','CCF B','CORE A']],
 ['Proceedings of the 22nd ACM SIGPLAN Symposium on Principles and Practice of …', ['PPoPP','CCF A','CORE B']],
 ['European Conference on Parallel Processing, 282-291', ['Euro-Par','CCF B','CORE B']],
 ['International Performance Computing and Communications Conference, 73-80', ['IPCCC','CCF C','CORE C']],
 ['2022 IEEE 28th International Symposium on On-Line Testing and Robust System …', ['IOLTS','CORE C']],
 ['2021 IEEE 28th International Conference on High Performance Computing, Data …', ['HiPC','CCF C']],
 ['2012 IEEE Seventh International Conference on Networking, Architecture, and …', ['NAS','CCF C']],
 ['2017 IEEE International Symposium on Defect and Fault Tolerance in VLSI and Nanotechnology Systems', ['DFTS']],
 ['Proceedings of the 9th EAI International Conference on Simulation Tools and Techniques', ['SIMUtools']],
 ['International Conference on Human-Computer Interaction, 47-58', ['HCII']],
 ['International Conference on Virtual, Augmented and Mixed Reality, 202-214', ['VAMR']],
 ['Proceedings of the ACM/IEEE International Conference on Connected Health: Applications, Systems and Engineering Technologies', ['CHASE']],
 ['International Conference on Cooperative and Human Aspects of Software Engineering', ['CHASE','CORE B']],
];
let count = 0;
for (const [input, expected] of cases) {
 assert.deepEqual(rank.badges(rank.lookup(input)).map(b => b.text), expected, input); count++;
}
for (const input of ['QCE 2024 Workshops', 'MLSys Workshops', 'IPDPS Workshops 2024', 'Companion Proceedings of the ACM Web Conference', 'Proceedings of the International Conference on …']) {
 assert.deepEqual(rank.badges(rank.lookup(input)).map(b => b.text), [], input); count++;
}
const collision = new SRRanking({core: { entries: [
 {abbr:'AAA',name:'IEEE International Conference on Example Computing',rank:'A'},
 {abbr:'BBB',name:'ACM International Conference on Example Computing',rank:'B'},
]}});
assert(!collision.lookup('2025 12th International Conference on Example Computing').core); count++;
assert(!rank.lookup('International Conference on Human-Computer Interaction').ccf); count++;
console.log(`${count} conference matching checks passed`);
