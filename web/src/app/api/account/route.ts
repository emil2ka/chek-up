// /api/account — GET: кто я, способы входа и устройства; PATCH: имя; DELETE: удалить аккаунт и данные.
import { z } from 'zod';
import { accountInfo, deleteAccount, rename } from '@/server/auth';
import { fail, ok, readJson, withAuth } from '@/server/http';

const Patch = z.object({ name: z.string().max(40) });
const Delete = z.object({ confirm: z.literal('delete') });

export const GET = (request: Request) => withAuth(request, 'account', async ({ db, me }) => ok(await accountInfo(db, me)));

export const PATCH = (request: Request) => withAuth(request, 'account', async ({ db, me }) => {
  const body = await readJson(request, Patch, 2_000);
  if (!body.ok) return body.res;
  await rename(db, me.userId, body.data.name);
  return ok();
});

export const DELETE = (request: Request) => withAuth(request, 'account', async ({ db, me }) => {
  const body = await readJson(request, Delete, 2_000);
  if (!body.ok) return fail(400, 'confirm', 'Нужно подтверждение удаления');
  await deleteAccount(db, me.userId);
  return ok();
});
