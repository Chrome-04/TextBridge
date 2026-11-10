import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose'
import { firebaseClientVerifier } from '../supabase/functions/api/firebase-client.ts'

const { publicKey, privateKey } = await generateKeyPair('RS256')
const jwk = {
  ...(await exportJWK(publicKey)),
  kid: 'test-key',
  alg: 'RS256',
  use: 'sig',
}
const resolver = createLocalJWKSet({ keys: [jwk] })
const config = {
  projectId: 'test-project',
  projectNumber: '123',
  appId: '1:123:web:test-app',
}
const verify = firebaseClientVerifier(config, {
  auth: resolver,
  appCheck: resolver,
})
const now = Math.floor(Date.now() / 1000)
async function tokens(
  authChanges: Record<string, unknown> = {},
  checkChanges: Record<string, unknown> = {},
) {
  const auth = await new SignJWT({
    iss: 'https://securetoken.google.com/test-project',
    aud: 'test-project',
    sub: 'guest-uid',
    iat: now,
    exp: now + 3600,
    auth_time: now,
    ...authChanges,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })
    .sign(privateKey)
  const check = await new SignJWT({
    iss: 'https://firebaseappcheck.googleapis.com/123',
    aud: ['projects/123'],
    sub: config.appId,
    iat: now,
    exp: now + 3600,
    ...checkChanges,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })
    .sign(privateKey)
  return new Request(
    'https://example.supabase.co/functions/v1/api/comments/list',
    {
      headers: {
        Authorization: `Bearer ${auth}`,
        'X-Firebase-AppCheck': check,
      },
    },
  )
}
test('signed Firebase identity and App Check return a stable guest rate-limit identity', async () => {
  assert.equal(await verify(await tokens()), 'firebase:guest-uid')
})
test('password, Google and Apple accounts keep verified temporary sharing access', async () => {
  for (const provider of ['password', 'google.com', 'apple.com']) {
    assert.equal(
      await verify(
        await tokens({
          sub: 'account-uid',
          firebase: { sign_in_provider: provider },
        }),
      ),
      'firebase:account-uid',
    )
  }
  assert.equal(
    await verify(
      await tokens(
        { sub: 'account-uid', firebase: { sign_in_provider: 'password' } },
        { aud: ['projects/999'] },
      ),
    ),
    null,
  )
})
test('missing, tampered, and self-signed tokens are refused', async () => {
  assert.equal(await verify(new Request('https://example.com')), null)
  const request = await tokens()
  request.headers.set(
    'authorization',
    request.headers.get('authorization')!.slice(0, -8) + 'tampered',
  )
  assert.equal(await verify(request), null)
  const other = await generateKeyPair('RS256')
  const forged = await new SignJWT({ sub: 'guest-uid' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .sign(other.privateKey)
  const fake = await tokens()
  fake.headers.set('authorization', `Bearer ${forged}`)
  assert.equal(await verify(fake), null)
})
test('wrong Firebase project, App Check project, and app ID cannot access this backend', async () => {
  for (const auth of [
    { aud: 'other-project' },
    { iss: 'https://securetoken.google.com/other-project' },
  ])
    assert.equal(await verify(await tokens(auth)), null)
  for (const check of [
    { aud: ['projects/999'] },
    { iss: 'https://firebaseappcheck.googleapis.com/999' },
    { sub: '1:123:web:another-app' },
  ])
    assert.equal(await verify(await tokens({}, check)), null)
})
test('expired tokens, future authentication times, and absent required times are refused', async () => {
  for (const auth of [
    { exp: now - 1 },
    { iat: now + 600 },
    { auth_time: now + 600 },
    { auth_time: undefined },
    { sub: '' },
  ])
    assert.equal(await verify(await tokens(auth)), null)
  for (const check of [{ exp: now - 1 }, { iat: now + 600 }])
    assert.equal(await verify(await tokens({}, check)), null)
})
test('incomplete Firebase project configuration fails closed', async () => {
  const missing = firebaseClientVerifier(
    { ...config, appId: '' },
    { auth: resolver, appCheck: resolver },
  )
  assert.equal(await missing(await tokens()), null)
})
