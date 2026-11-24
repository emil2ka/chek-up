// POST /api/family/leave — выйти из семьи. Свои чеки остаются со мной.
import { leaveFamily } from '@/server/family';
import { ok, withAuth } from '@/server/http';

export const POST = (request: Request) => withAuth(request, 'family.leave', async ({ db, me }) => ok(await leaveFamily(db, me.userId)));
