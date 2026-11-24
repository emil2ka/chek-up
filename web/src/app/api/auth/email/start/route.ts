// POST /api/auth/email/start — прислать код входа на почту. Ответ одинаковый, есть такой аккаунт или нет.
import { z } from 'zod';
import { issueEmailCode, normalizeEmail } from '@/server/auth';
import { clientIp, fail, guarded, ok, rateLimiter, readJson } from '@/server/http';
import { mailEnabled, sendCode } from '@/server/mail';
import { consume } from '@/server/usage';

const limited = rateLimiter(10, 10 * 60_000);
const Body = z.object({ email: z.string().max(120).transform(normalizeEmail).pipe(z.email()) });

export const POST = (request: Request) => guarded('auth.email', async db => {
  if (!mailEnabled()) return fail(404, 'disabled', 'Вход по почте пока не подключён');
  if (limited(clientIp(request))) return fail(429, 'rate_limit', 'Слишком много попыток. Попробуй позже');
  const body = await readJson(request, Body, 2_000);
  if (!body.ok) return fail(400, 'bad_email', 'Проверь адрес почты');
  const { email } = body.data;
  if (!(await consume(db, `mail:${email}`, 10))) return fail(429, 'rate_limit', 'Слишком много писем на этот адрес. Попробуй завтра');
  const code = await issueEmailCode(db, email);
  if (!code) return fail(429, 'too_soon', 'Код уже отправлен. Новый можно попросить через минуту');
  try {
    await sendCode(email, code);
  } catch (err) {
    console.error('[mail]', err instanceof Error ? err.message : err);
    return fail(503, 'mail_failed', 'Не получилось отправить письмо. Попробуй позже');
  }
  return ok();
});
