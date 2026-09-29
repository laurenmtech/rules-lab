import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

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
  // Seed with rules off. Roles live in /users, which clients can't write.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/wanda'), { role: 'witch' });
    await setDoc(doc(db, 'users/smaug'), { role: 'dragon' });
    await setDoc(doc(db, 'users/sparkle'), { role: 'unicorn' });
    // 'nobody' is signed in but has no profile doc, so no role.
    await setDoc(doc(db, 'spellbook/fireball'), { words: 'ignis' });
    await setDoc(doc(db, 'hoard/crown'), { gold: 500 });
    await setDoc(doc(db, 'meadow/wanda-post'), { authorId: 'wanda', text: 'hello' });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('users', () => {
  test('users can read their own profile', async () => {
    await assertSucceeds(getDoc(doc(as('wanda'), 'users/wanda')));
  });

  test("users can't read someone else's profile", async () => {
    await assertFails(getDoc(doc(as('wanda'), 'users/smaug')));
  });

  test("users can't change their own role", async () => {
    await assertFails(updateDoc(doc(as('wanda'), 'users/wanda'), { role: 'dragon' }));
  });

  test("a user with no profile can't create one", async () => {
    await assertFails(setDoc(doc(as('nobody'), 'users/nobody'), { role: 'unicorn' }));
  });
});

describe('spellbook (witches only)', () => {
  test('witch can read and write spells', async () => {
    const db = as('wanda');
    await assertSucceeds(getDoc(doc(db, 'spellbook/fireball')));
    await assertSucceeds(setDoc(doc(db, 'spellbook/frostbolt'), { words: 'glacies' }));
  });

  test("dragon can't read spells", async () => {
    await assertFails(getDoc(doc(as('smaug'), 'spellbook/fireball')));
  });

  test("unicorn can't write spells", async () => {
    await assertFails(setDoc(doc(as('sparkle'), 'spellbook/rainbow'), { words: 'iris' }));
  });

  test("signed-in user with no role can't read spells", async () => {
    await assertFails(getDoc(doc(as('nobody'), 'spellbook/fireball')));
  });

  test("signed-out visitor can't read spells", async () => {
    await assertFails(getDoc(doc(anon(), 'spellbook/fireball')));
  });
});

describe('hoard (everyone looks, dragons touch)', () => {
  test('every role can read the hoard', async () => {
    for (const uid of ['wanda', 'smaug', 'sparkle']) {
      await assertSucceeds(getDoc(doc(as(uid), 'hoard/crown')));
    }
  });

  test('dragon can add and remove treasure', async () => {
    const db = as('smaug');
    await assertSucceeds(setDoc(doc(db, 'hoard/goblet'), { gold: 50 }));
    await assertSucceeds(deleteDoc(doc(db, 'hoard/crown')));
  });

  test("witch can't take from the hoard", async () => {
    await assertFails(deleteDoc(doc(as('wanda'), 'hoard/crown')));
  });

  test("unicorn can't add to the hoard", async () => {
    await assertFails(setDoc(doc(as('sparkle'), 'hoard/horn'), { gold: 1 }));
  });

  test("user with no role can't read the hoard", async () => {
    await assertFails(getDoc(doc(as('nobody'), 'hoard/crown')));
  });
});

describe('meadow (authors own posts, unicorns moderate)', () => {
  test('any role can post as themselves', async () => {
    await assertSucceeds(
      setDoc(doc(as('smaug'), 'meadow/smaug-post'), { authorId: 'smaug', text: 'roar' }),
    );
  });

  test("can't post pretending to be someone else", async () => {
    await assertFails(
      setDoc(doc(as('smaug'), 'meadow/fake'), { authorId: 'wanda', text: 'i love dragons' }),
    );
  });

  test("user with no role can't post", async () => {
    await assertFails(
      setDoc(doc(as('nobody'), 'meadow/n'), { authorId: 'nobody', text: 'hi' }),
    );
  });

  test('author can edit their own post', async () => {
    await assertSucceeds(updateDoc(doc(as('wanda'), 'meadow/wanda-post'), { text: 'edited' }));
  });

  test("author can't hand their post to someone else", async () => {
    await assertFails(updateDoc(doc(as('wanda'), 'meadow/wanda-post'), { authorId: 'smaug' }));
  });

  test("can't edit someone else's post", async () => {
    await assertFails(updateDoc(doc(as('smaug'), 'meadow/wanda-post'), { text: 'hacked' }));
  });

  test("unicorn can't edit someone else's post", async () => {
    await assertFails(updateDoc(doc(as('sparkle'), 'meadow/wanda-post'), { text: 'nicer' }));
  });

  test("unicorn can delete anyone's post", async () => {
    await assertSucceeds(deleteDoc(doc(as('sparkle'), 'meadow/wanda-post')));
  });

  test("dragon can't delete someone else's post", async () => {
    await assertFails(deleteDoc(doc(as('smaug'), 'meadow/wanda-post')));
  });

  test('author can delete their own post', async () => {
    await assertSucceeds(deleteDoc(doc(as('wanda'), 'meadow/wanda-post')));
  });
});
