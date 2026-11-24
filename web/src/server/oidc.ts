// Вход через Google и Apple: клиент присылает id_token, сервер проверяет подпись, издателя, получателя и срок.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Identity } from './auth';

const list = (v: string | undefined) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean);

const PROVIDERS = {
  google: { issuer: ['https://accounts.google.com', 'accounts.google.com'], jwks: 'https://www.googleapis.com/oauth2/v3/certs', audience: () => list(process.env.GOOGLE_CLIENT_ID) },
  apple: { issuer: ['https://appleid.apple.com'], jwks: 'https://appleid.apple.com/auth/keys', audience: () => list(process.env.APPLE_CLIENT_ID) },
} as const;
export type OidcProvider = keyof typeof PROVIDERS;

const keys = new Map<OidcProvider, ReturnType<typeof createRemoteJWKSet>>();
export const oidcEnabled = (p: OidcProvider) => PROVIDERS[p].audience().length > 0;

/** null — токен не прошёл проверку. */
export async function verifyIdToken(provider: OidcProvider, idToken: string, getKey?: Parameters<typeof jwtVerify>[1]): Promise<Identity | null> {
  const cfg = PROVIDERS[provider];
  const audience = cfg.audience();
  if (!audience.length) return null;
  let jwks = keys.get(provider);
  if (!jwks) keys.set(provider, jwks = createRemoteJWKSet(new URL(cfg.jwks)));
  try {
    const { payload } = await jwtVerify(idToken, (getKey ?? jwks) as ReturnType<typeof createRemoteJWKSet>, { issuer: [...cfg.issuer], audience, algorithms: ['RS256', 'ES256'], maxTokenAge: '1h' });
    if (!payload.sub) return null;
    // адрес берём, только если провайдер его подтвердил: по нему склеиваем аккаунты
    const verified = payload.email_verified === true || payload.email_verified === 'true';
    const email = verified && typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    return { provider, subject: payload.sub, email, name: typeof payload.name === 'string' ? payload.name : undefined };
  } catch {
    return null;
  }
}
