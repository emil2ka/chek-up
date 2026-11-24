// POST /api/account/signout — отключить это устройство, все остальные, все или одно по id.
import { z } from 'zod';
import { signOut } from '@/server/auth';
import { ok, readJson, withAuth } from '@/server/http';

const Body = z.object({ what: z.union([z.enum(['this', 'others', 'all']), z.uuid()]) });

export const POST = (request: Request) => withAuth(request, 'account.signout', async ({ db, me }) => {
  const body = await readJson(request, Body, 2_000);
  if (!body.ok) return body.res;
  await signOut(db, me, body.data.what);
  return ok();
});
