// GET /api/auth/providers — какие способы входа настроены на этом сервере (клиент показывает только их).
import { connection } from 'next/server';
import { ok } from '@/server/http';
import { mailEnabled } from '@/server/mail';
import { oidcEnabled } from '@/server/oidc';

export async function GET() {
  await connection();
  return ok({ email: mailEnabled(), google: oidcEnabled('google') ? process.env.GOOGLE_CLIENT_ID!.split(',')[0].trim() : null, apple: oidcEnabled('apple') });
}
