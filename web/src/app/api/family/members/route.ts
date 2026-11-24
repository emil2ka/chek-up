// /api/family/members — PATCH: сменить роль (owner передаёт владение); DELETE: убрать участника. Только владелец.
import { z } from 'zod';
import { membershipOf, removeMember, setRole } from '@/server/family';
import { ok, readJson, withAuth } from '@/server/http';

const Patch = z.object({ userId: z.uuid(), role: z.enum(['owner', 'adult', 'child']) });
const Del = z.object({ userId: z.uuid() });

export const PATCH = (request: Request) => withAuth(request, 'family.members', async ({ db, me }) => {
  const body = await readJson(request, Patch, 2_000);
  if (!body.ok) return body.res;
  await setRole(db, await membershipOf(db, me.userId), body.data.userId, body.data.role);
  return ok();
});

export const DELETE = (request: Request) => withAuth(request, 'family.members', async ({ db, me }) => {
  const body = await readJson(request, Del, 2_000);
  if (!body.ok) return body.res;
  await removeMember(db, await membershipOf(db, me.userId), body.data.userId);
  return ok();
});
