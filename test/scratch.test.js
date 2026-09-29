import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-lab',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8180,
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  // Seed with rules off. Deny-by-default would otherwise block our own setup.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'scratch/hello'), { msg: 'hi' });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('scratch', () => {
  test('unauthenticated read fails', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'scratch/hello')));
  });

  test('signed-in read succeeds', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(db, 'scratch/hello')));
  });

  test('signed-in write fails', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'scratch/hello'), { msg: 'overwritten' }));
  });

  test('anything outside scratch is denied', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(getDoc(doc(db, 'other/thing')));
  });
});
