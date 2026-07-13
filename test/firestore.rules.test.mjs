/* TwistyTools — shared Firestore security-rules tests (OPT-IN, dev-only).
 *
 * Exercises the hub repo's firestore.rules against the Firestore emulator.
 * Moved here from the pyraminx repo (test/firestore.rules.test.mjs, 34 tests)
 * and extended for the puzzles/{puzzle}/... namespaced schema: per-puzzle
 * constants (nslots, census totals, field whitelists), cross-puzzle moderator
 * isolation, skewb's `notation` field, FTO's no-census lockout, and the
 * users/{uid}/puzzles/{puzzle} progress subtree.
 *
 *   npm i
 *   npm run test:rules       (wraps: firebase emulators:exec --only firestore
 *                             "node test/firestore.rules.test.mjs")
 */
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const testEnv = await initializeTestEnvironment({
  projectId: 'twistytools-rules-test',
  firestore: { rules: fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8') },
});

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('✓ ' + name); }
  catch (e) { console.log('✗ ' + name + '\n    ' + (e && e.message)); failed++; }
}

const authed = (uid, email = uid + '@example.com') => testEnv.authenticatedContext(uid, { email }).firestore();
// verified-email context: the moderator-invite rules require email_verified == true
const authedV = (uid, email = uid + '@example.com') => testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

// namespaced path helpers
const solutions = (puzzle) => `puzzles/${puzzle}/solutions`;
const meta = (puzzle, d) => [`puzzles/${puzzle}/meta`, d];
const moderators = (puzzle) => `puzzles/${puzzle}/moderators`;
const invites = (puzzle) => `puzzles/${puzzle}/moderatorInvites`;

// Seed privileged docs / fixtures bypassing the rules.
async function seed(fn) { await testEnv.withSecurityRulesDisabled(c => fn(c.firestore())); }
const makeAdmin = (uid) => seed(db => setDoc(doc(db, 'admins', uid), {}));
const makeMod = (puzzle, uid, email) => seed(async (db) => {
  await setDoc(doc(db, moderators(puzzle), uid), { email });
  await setDoc(doc(db, invites(puzzle), email), {});
});

// A full, valid create payload — exactly the fields each site's submit() writes.
// skewb additionally requires notation ('wca' | 'ns').
function validSolution(puzzle, uid, overrides = {}) {
  return {
    uid, status: 'pending', createdAt: serverTimestamp(),
    pairId: 100, classId: 100, partnerId: 200,
    scramble: "R U' L", solution: 'R L U B L', moves: 5,
    name: 'Tester', showName: true,
    ...(puzzle === 'skewb' ? { notation: 'wca' } : {}),
    ...overrides,
  };
}

// ---------------- users: account doc ----------------
await test('users: anonymous read denied', () =>
  assertFails(getDoc(doc(anon(), 'users', 'someone'))));
await test('users: own doc read/write allowed', async () => {
  const db = authed('u1');
  await assertSucceeds(setDoc(doc(db, 'users', 'u1'), { prefs: 1 }));
  await assertSucceeds(getDoc(doc(db, 'users', 'u1')));
});
await test('users: other user doc denied', () =>
  assertFails(getDoc(doc(authed('u1'), 'users', 'u2'))));

// ---------------- users: per-puzzle progress subtree ----------------
await test('users/puzzles: own progress doc allowed for all three puzzles', async () => {
  const db = authed('u1');
  await assertSucceeds(setDoc(doc(db, 'users/u1/puzzles', 'pyraminx'), { trainer: {} }));
  await assertSucceeds(setDoc(doc(db, 'users/u1/puzzles', 'skewb'), { trainer: {} }));
  await assertSucceeds(setDoc(doc(db, 'users/u1/puzzles', 'fto'), { trainer: {} }));
});
await test('users/puzzles: other user\'s progress doc denied', () =>
  assertFails(setDoc(doc(authed('u1'), 'users/u2/puzzles', 'pyraminx'), { trainer: {} })));
await test('users/puzzles: unknown puzzle segment denied', () =>
  assertFails(setDoc(doc(authed('u1'), 'users/u1/puzzles', 'junkpuzzle'), { trainer: {} })));

// ---------------- solutions: create (moderators only, per puzzle) ----------------
// 'a' is our pyraminx moderator author for the create tests; the field-validation
// cases below need it to pass the isMod() gate so they exercise the validation.
await makeMod('pyraminx', 'a', 'a@example.com');
await test('solutions: anonymous create denied', () =>
  assertFails(addDoc(collection(anon(), solutions('pyraminx')), validSolution('pyraminx', 'nobody'))));
await test('solutions: non-moderator create denied', () =>
  assertFails(addDoc(collection(authed('plainuser'), solutions('pyraminx')), validSolution('pyraminx', 'plainuser'))));
await test('solutions: valid moderator create allowed', () =>
  assertSucceeds(addDoc(collection(authed('a'), solutions('pyraminx')), validSolution('pyraminx', 'a'))));
await test('solutions: wrong uid denied', () =>
  assertFails(addDoc(collection(authed('a'), solutions('pyraminx')), validSolution('pyraminx', 'attacker'))));
await test('solutions: status != pending denied', () =>
  assertFails(addDoc(collection(authed('a'), solutions('pyraminx')), validSolution('pyraminx', 'a', { status: 'approved' }))));
await test('solutions: extra field denied (hasOnly)', () =>
  assertFails(addDoc(collection(authed('a'), solutions('pyraminx')), validSolution('pyraminx', 'a', { adminNotes: 'x' }))));
await test('solutions: missing scramble denied', () => {
  const d = validSolution('pyraminx', 'a'); delete d.scramble;
  return assertFails(addDoc(collection(authed('a'), solutions('pyraminx')), d));
});
await test('solutions: empty scramble denied', () =>
  assertFails(addDoc(collection(authed('a'), solutions('pyraminx')), validSolution('pyraminx', 'a', { scramble: '' }))));
await test('solutions: oversized solution denied', () =>
  assertFails(addDoc(collection(authed('a'), solutions('pyraminx')), validSolution('pyraminx', 'a', { solution: 'R'.repeat(300) }))));
await test('solutions: non-bool showName denied', () =>
  assertFails(addDoc(collection(authed('a'), solutions('pyraminx')), validSolution('pyraminx', 'a', { showName: 'yes' }))));
await test('solutions: moves out of range denied', () =>
  assertFails(addDoc(collection(authed('a'), solutions('pyraminx')), validSolution('pyraminx', 'a', { moves: 16 }))));
await test('solutions: opted-out name must be empty (privacy)', () =>
  assertFails(addDoc(collection(authed('a'), solutions('pyraminx')), validSolution('pyraminx', 'a', { showName: false, name: 'Leaky' }))));
await test('solutions: opted-out with empty name allowed', () =>
  assertSucceeds(addDoc(collection(authed('a'), solutions('pyraminx')), validSolution('pyraminx', 'a', { showName: false, name: '' }))));

// ---------------- solutions: per-puzzle constants ----------------
await makeMod('skewb', 'sk', 'sk@example.com');
await test('solutions: pyraminx classId at its NSLOTS bound denied', () =>
  assertFails(addDoc(collection(authed('a'), solutions('pyraminx')), validSolution('pyraminx', 'a', { classId: 3732480 }))));
await test('solutions: skewb accepts ids past the pyraminx bound (own NSLOTS)', () =>
  assertSucceeds(addDoc(collection(authed('sk'), solutions('skewb')), validSolution('skewb', 'sk', { classId: 5000000 }))));
await test('solutions: skewb classId at its NSLOTS bound denied', () =>
  assertFails(addDoc(collection(authed('sk'), solutions('skewb')), validSolution('skewb', 'sk', { classId: 9447840 }))));

// ---------------- solutions: notation (skewb-only field) ----------------
await test('notation: skewb create without notation denied (required there)', () => {
  const d = validSolution('skewb', 'sk'); delete d.notation;
  return assertFails(addDoc(collection(authed('sk'), solutions('skewb')), d));
});
await test('notation: skewb invalid notation value denied', () =>
  assertFails(addDoc(collection(authed('sk'), solutions('skewb')), validSolution('skewb', 'sk', { notation: 'sarah' }))));
await test('notation: skewb ns notation allowed', () =>
  assertSucceeds(addDoc(collection(authed('sk'), solutions('skewb')), validSolution('skewb', 'sk', { notation: 'ns' }))));
await test('notation: pyraminx create with notation field denied (hasOnly)', () =>
  assertFails(addDoc(collection(authed('a'), solutions('pyraminx')), validSolution('pyraminx', 'a', { notation: 'wca' }))));

// ---------------- cross-puzzle moderator isolation ----------------
await test('isolation: pyraminx moderator cannot create skewb solutions', () =>
  assertFails(addDoc(collection(authed('a'), solutions('skewb')), validSolution('skewb', 'a'))));
await test('isolation: skewb moderator cannot write pyraminx meta', () =>
  assertFails(setDoc(doc(authed('sk'), ...meta('pyraminx', 'stats')), { done: 1, total: 78012 })));

// ---------------- fto: no census, everything census-shaped denied ----------------
await makeAdmin('bigadmin');
await test('fto: solution create denied even for an admin (no cfg entry)', () =>
  assertFails(addDoc(collection(authed('bigadmin'), solutions('fto')), validSolution('pyraminx', 'bigadmin'))));
await test('fto: meta stats write denied even for an admin (no cfg entry)', () =>
  assertFails(setDoc(doc(authed('bigadmin'), ...meta('fto', 'stats')), { done: 0, total: 1 })));

// ---------------- solutions: update ----------------
async function seedPending(puzzle, id, status = 'pending') {
  await seed(db => setDoc(doc(db, solutions(puzzle), id), {
    uid: 'author', status, pairId: 1, classId: 1, partnerId: 2,
    scramble: 'R', solution: 'R L U', moves: 3, name: 'A', showName: false,
  }));
}
await test('solutions: non-mod update denied', async () => {
  await seedPending('pyraminx', 's1');
  await assertFails(updateDoc(doc(authed('rando'), solutions('pyraminx'), 's1'), { status: 'approved' }));
});
await test('solutions: moderator review-field update allowed', async () => {
  await seedPending('pyraminx', 's2'); await makeMod('pyraminx', 'mod1', 'mod1@example.com');
  await assertSucceeds(updateDoc(doc(authed('mod1', 'mod1@example.com'), solutions('pyraminx'), 's2'),
    { status: 'approved', reviewedBy: 'mod1' }));
});
await test('solutions: forged reviewedBy denied (must be own uid)', async () => {
  await seedPending('pyraminx', 's2b'); await makeMod('pyraminx', 'mod1b', 'mod1b@example.com');
  await assertFails(updateDoc(doc(authed('mod1b', 'mod1b@example.com'), solutions('pyraminx'), 's2b'),
    { status: 'approved', reviewedBy: 'someone-else' }));
});
await test('solutions: moderator content edit denied', async () => {
  await seedPending('pyraminx', 's3'); await makeMod('pyraminx', 'mod2', 'mod2@example.com');
  await assertFails(updateDoc(doc(authed('mod2', 'mod2@example.com'), solutions('pyraminx'), 's3'),
    { solution: 'hacked' }));
});
await test('solutions: moderator re-review of a decided doc denied (pending only)', async () => {
  await seedPending('pyraminx', 's3b', 'approved'); await makeMod('pyraminx', 'mod2b', 'mod2b@example.com');
  await assertFails(updateDoc(doc(authed('mod2b', 'mod2b@example.com'), solutions('pyraminx'), 's3b'),
    { status: 'rejected', reviewedBy: 'mod2b' }));
});
await test('solutions: admin broad edit allowed', async () => {
  await seedPending('pyraminx', 's4'); await makeAdmin('admin1');
  await assertSucceeds(updateDoc(doc(authed('admin1'), solutions('pyraminx'), 's4'), { solution: 'fixed' }));
});
await test('solutions: cross-puzzle moderator cannot review', async () => {
  await seedPending('skewb', 'sx1');
  await assertFails(updateDoc(doc(authed('mod1', 'mod1@example.com'), solutions('skewb'), 'sx1'),
    { status: 'approved', reviewedBy: 'mod1' }));
});

// ---------------- moderator invite self-accept (per puzzle) ----------------
await test('moderators: self-accept with verified email + matching invite allowed', async () => {
  await seed(db => setDoc(doc(db, invites('pyraminx'), 'eve@example.com'), { addedBy: 'admin' }));
  await assertSucceeds(setDoc(doc(authedV('eve', 'eve@example.com'), moderators('pyraminx'), 'eve'),
    { email: 'eve@example.com', via: 'invite' }));
});
await test('moderators: self-accept without a matching invite denied', () =>
  assertFails(setDoc(doc(authedV('mallory', 'mallory@example.com'), moderators('pyraminx'), 'mallory'),
    { email: 'mallory@example.com', via: 'invite' })));
await test('moderators: self-accept with UNVERIFIED email denied', async () => {
  await seed(db => setDoc(doc(db, invites('pyraminx'), 'unv@example.com'), {}));
  await assertFails(setDoc(doc(authed('unv', 'unv@example.com'), moderators('pyraminx'), 'unv'),
    { email: 'unv@example.com', via: 'invite' }));
});
await test('moderators: self-accept with spoofed stored email denied', async () => {
  await seed(db => setDoc(doc(db, invites('pyraminx'), 'real@example.com'), {}));
  await assertFails(setDoc(doc(authedV('real', 'real@example.com'), moderators('pyraminx'), 'real'),
    { email: 'admin@example.com', via: 'invite' }));
});
await test('moderators: a pyraminx invite does not grant skewb moderator', async () => {
  await seed(db => setDoc(doc(db, invites('pyraminx'), 'cross@example.com'), {}));
  await assertFails(setDoc(doc(authedV('cross', 'cross@example.com'), moderators('skewb'), 'cross'),
    { email: 'cross@example.com', via: 'invite' }));
});
await test('moderatorInvites: invited user may consume (delete) their OWN invite', async () => {
  await seed(db => setDoc(doc(db, invites('pyraminx'), 'consume@example.com'), {}));
  await assertSucceeds(deleteDoc(doc(authedV('c1', 'consume@example.com'), invites('pyraminx'), 'consume@example.com')));
});
await test('moderatorInvites: cannot delete someone else\'s invite', async () => {
  await seed(db => setDoc(doc(db, invites('pyraminx'), 'victim@example.com'), {}));
  await assertFails(deleteDoc(doc(authedV('attacker', 'attacker@example.com'), invites('pyraminx'), 'victim@example.com')));
});
await test('moderatorInvites: admin may re-invite an existing email (update)', async () => {
  await makeAdmin('adm2');
  await seed(db => setDoc(doc(db, invites('pyraminx'), 'again@example.com'), { addedBy: 'x' }));
  await assertSucceeds(setDoc(doc(authed('adm2'), invites('pyraminx'), 'again@example.com'), { addedBy: 'adm2' }));
});

// ---------------- admins / meta ----------------
await test('admins: non-admin write denied', () =>
  assertFails(setDoc(doc(authed('u9'), 'admins', 'u9'), {})));
await test('admins: admin may grant admin', async () => {
  await makeAdmin('adm3');
  await assertSucceeds(setDoc(doc(authed('adm3'), 'admins', 'newadmin'), {}));
});
await test('meta: world-readable without auth', async () => {
  await seed(db => setDoc(doc(db, ...meta('pyraminx', 'stats')), { done: 1, total: 78012 }));
  await assertSucceeds(getDoc(doc(anon(), ...meta('pyraminx', 'stats'))));
});
await test('meta: moderator write allowed, plain user denied', async () => {
  await makeMod('pyraminx', 'mod3', 'mod3@example.com');
  await assertSucceeds(setDoc(doc(authed('mod3', 'mod3@example.com'), ...meta('pyraminx', 'stats')), { done: 1, total: 78012 }));
  await assertFails(setDoc(doc(authed('plain'), ...meta('pyraminx', 'stats')), { done: 1, total: 78012 }));
});
await test('meta: stats with wrong total / extra keys / bad types denied', async () => {
  const db = authed('mod3', 'mod3@example.com');
  await assertFails(setDoc(doc(db, ...meta('pyraminx', 'stats')), { done: 1, total: 2 }));
  await assertFails(setDoc(doc(db, ...meta('pyraminx', 'stats')), { done: 1, total: 78012, extra: 'x' }));
  await assertFails(setDoc(doc(db, ...meta('pyraminx', 'stats')), { done: -1, total: 78012 }));
  await assertFails(setDoc(doc(db, ...meta('pyraminx', 'stats')), { done: 'many', total: 78012 }));
});
await test('meta: stats totals are per-puzzle (pyraminx total invalid on skewb)', async () => {
  await makeMod('skewb', 'smod', 'smod@example.com');
  const db = authed('smod', 'smod@example.com');
  await assertFails(setDoc(doc(db, ...meta('skewb', 'stats')), { done: 1, total: 78012 }));
  await assertSucceeds(setDoc(doc(db, ...meta('skewb', 'stats')), { done: 1, total: 132315 }));
});
await test('meta: doneMap shape enforced (b64 string only, size-capped)', async () => {
  const db = authed('mod3', 'mod3@example.com');
  await assertSucceeds(setDoc(doc(db, ...meta('pyraminx', 'doneMap')), { b64: 'AAAA' }));
  await assertFails(setDoc(doc(db, ...meta('pyraminx', 'doneMap')), { b64: 'A'.repeat(13005) }));
  await assertFails(setDoc(doc(db, ...meta('pyraminx', 'doneMap')), { b64: 'AAAA', junk: 1 }));
  await assertFails(setDoc(doc(db, ...meta('pyraminx', 'doneMap')), { b64: 42 }));
});
await test('meta: doneMap size cap is per-puzzle (skewb takes its bigger bitmap)', async () => {
  const db = authed('smod', 'smod@example.com');
  await assertSucceeds(setDoc(doc(db, ...meta('skewb', 'doneMap')), { b64: 'A'.repeat(22056) }));
  await assertFails(setDoc(doc(db, ...meta('skewb', 'doneMap')), { b64: 'A'.repeat(22057) }));
});
await test('meta: arbitrary meta doc write denied even for mods', () =>
  assertFails(setDoc(doc(authed('mod3', 'mod3@example.com'), ...meta('pyraminx', 'other')), { anything: 'goes' })));

await testEnv.cleanup();
console.log('\n' + (failed ? '*** ' + failed + ' rules test(s) failed ***' : 'all rules tests passed'));
process.exitCode = failed > 0 ? 1 : 0;
