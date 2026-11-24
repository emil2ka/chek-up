import { generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { verifyIdToken } from './oidc';

let keys: Awaited<ReturnType<typeof generateKeyPair>>, other: typeof keys;
beforeAll(async () => { keys = await generateKeyPair('RS256'); other = await generateKeyPair('RS256'); vi.stubEnv('GOOGLE_CLIENT_ID', 'web-id, ios-id'); });

const token = (claims: object = {}, o: { aud?: string; iss?: string; key?: CryptoKey; exp?: string } = {}) =>
  new SignJWT({ email: 'Anna@Example.com', email_verified: true, ...claims }).setProtectedHeader({ alg: 'RS256' }).setSubject('42').setIssuedAt()
    .setIssuer(o.iss ?? 'https://accounts.google.com').setAudience(o.aud ?? 'ios-id').setExpirationTime(o.exp ?? '30m').sign(o.key ?? (keys.privateKey as CryptoKey));
const check = async (t: Promise<string>) => verifyIdToken('google', await t, (async () => keys.publicKey) as never);

describe('verifyIdToken', () => {
  it('верный токен любого из наших клиентов', async () => {
    expect(await check(token())).toMatchObject({ provider: 'google', subject: '42', email: 'anna@example.com' });
    expect(await check(token({}, { aud: 'web-id' }))).not.toBeNull();
  });
  it('неподтверждённую почту не берём', async () => {
    expect(await check(token({ email_verified: false }))).toMatchObject({ email: '' });
  });
  it('чужой получатель, издатель, подпись, просроченный — отказ', async () => {
    expect(await check(token({}, { aud: 'evil' }))).toBeNull();
    expect(await check(token({}, { iss: 'https://evil.example' }))).toBeNull();
    expect(await check(token({}, { key: other.privateKey as CryptoKey }))).toBeNull();
    expect(await check(token({}, { exp: '-1m' }))).toBeNull();
    expect(await check(Promise.resolve('мусор'))).toBeNull();
  });
  it('провайдер не настроен — отказ', async () => {
    expect(await verifyIdToken('apple', await token())).toBeNull();
  });
});
