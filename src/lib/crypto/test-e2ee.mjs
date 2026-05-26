/**
 * Minimal E2EE test for Squawk Voice Messaging
 * Tests the Olm Double Ratchet session lifecycle:
 * 1. Init Olm WASM
 * 2. Generate identity keys
 * 3. Create outbound + inbound sessions (simulating two peers)
 * 4. Encrypt a test message
 * 5. Decrypt it back
 * 6. Verify plaintext matches original
 */

import { initOlm, generateIdentityKeys, publishOneTimeKeys, getKeyBundle } from './olm.js';
import { createOutboundSession } from './olm.js';
import { createInboundSession } from './olm.js';
import { encrypt, decrypt } from './olm.js';

async function run() {
  console.log('=== Squawk E2EE Test ===\n');
  
  try {
    // 1. Init Olm
    console.log('[1] Initializing Olm WASM...');
    await initOlm();
    console.log('    Olm ready.\n');

    // 2. Generate Alice's identity
    console.log('[2] Generating Alice identity keys...');
    const aliceKeys = await generateIdentityKeys();
    console.log('    Alice ed25519:', aliceKeys.ed25519?.substring(0, 20) + '...');
    console.log('    Alice curve25519:', aliceKeys.curve25519?.substring(0, 20) + '...\n');

    // 3. Generate Bob's identity  
    console.log('[3] Generating Bob identity keys...');
    const bobOlm = await initOlm();
    const bobAccount = new bobOlm.Account();
    bobAccount.generateOneTimeKeys(1);
    const bobIdentityRaw = JSON.parse(bobAccount.identityKeys());
    const bobKeys = {
      ed25519: bobIdentityRaw.ed25519,
      curve25519: bobIdentityRaw.curve25519,
      pickled: bobAccount.pickle({ pickleKey: 'bob-local-key' }),
      createdAt: Date.now(),
    };
    bobAccount.free();
    // Save Bob's identity for unpickleAccount to work
    localStorage.setItem('squawk_identity', JSON.stringify(bobKeys));
    console.log('    Bob ed25519:', bobKeys.ed25519?.substring(0, 20) + '...');
    console.log('    Bob curve25519:', bobKeys.curve25519?.substring(0, 20) + '...\n');

    // 4. Alice publishes a one-time key for Bob
    console.log('[4] Alice publishing one-time key...');
    await publishOneTimeKeys(1);
    const aliceBundle = await getKeyBundle();
    console.log('    Alice identityKey:', aliceBundle.identityKey?.substring(0, 20) + '...');
    console.log('    Alice oneTimeKey:', aliceBundle.oneTimeKey?.substring(0, 20) + '...\n');

    // 5. Bob publishes a one-time key for Alice
    console.log('[5] Bob publishing one-time key...');
    const bobOlm2 = await initOlm();
    const bobAcc2 = new bobOlm2.Account();
    bobAcc2.unpickle({ pickleKey: 'bob-local-key', pickled: bobKeys.pickled });
    bobAcc2.generateOneTimeKeys(1);
    const bobOtks = JSON.parse(bobAcc2.getOneTimeKeys());
    bobKeys.pickled = bobAcc2.pickle({ pickleKey: 'bob-local-key' });
    localStorage.setItem('squawk_identity', JSON.stringify(bobKeys));
    bobAcc2.free();
    const bobOtKey = Object.values(bobOtks.curve25519)[0];
    console.log('    Bob OTK:', bobOtKey?.substring(0, 20) + '...\n');

    // 6. Alice creates outbound session with Bob's OTK
    console.log('[6] Alice creating outbound session with Bob...');
    // Restore Alice's identity
    localStorage.setItem('squawk_identity', JSON.stringify(aliceKeys));
    const aliceSessionId = await createOutboundSession(
      bobKeys.curve25519,
      bobOtKey,
      'bob'
    );
    console.log('    Alice session ID:', aliceSessionId, '\n');

    // 7. Bob creates inbound session from Alice's OTK
    console.log('[7] Bob creating inbound session from Alice...');
    localStorage.setItem('squawk_identity', JSON.stringify(bobKeys));
    const bobSessionId = await createInboundSession(
      aliceBundle.identityKey,
      aliceBundle.oneTimeKey,
      'alice'
    );
    console.log('    Bob session ID:', bobSessionId, '\n');

    // 8. Alice encrypts a message
    console.log('[8] Alice encrypting message...');
    localStorage.setItem('squawk_identity', JSON.stringify(aliceKeys));
    const plaintext = 'Hello Bob, this is an encrypted voice message!';
    const encrypted = await encrypt(aliceSessionId, plaintext);
    console.log('    Plaintext:', plaintext);
    console.log('    Encrypted:', encrypted.substring(0, 40) + '...\n');

    // 9. Bob decrypts the message
    console.log('[9] Bob decrypting message...');
    localStorage.setItem('squawk_identity', JSON.stringify(bobKeys));
    const decrypted = await decrypt(bobSessionId, encrypted);
    console.log('    Decrypted:', decrypted, '\n');

    // 10. Verify
    console.log('[10] Verification:');
    if (decrypted === plaintext) {
      console.log('    ✅ PASS: Decrypted message matches original!');
    } else {
      console.log('    ❌ FAIL: Mismatch!');
      console.log('    Expected:', plaintext);
      console.log('    Got:', decrypted);
      process.exit(1);
    }

  } catch (err) {
    console.error('❌ ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

run();