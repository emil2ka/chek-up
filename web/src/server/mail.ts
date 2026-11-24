// Отправка кода входа. Настроен Resend (RESEND_API_KEY + MAIL_FROM) — уходит письмо.
// Не настроен: в разработке код печатается в консоль сервера, в продакшене вход по почте выключен.
export const mailConfigured = () => !!process.env.RESEND_API_KEY?.trim() && !!process.env.MAIL_FROM?.trim();
export const mailEnabled = () => mailConfigured() || process.env.NODE_ENV !== 'production';

export async function sendCode(email: string, code: string): Promise<void> {
  if (!mailConfigured()) {
    if (process.env.NODE_ENV === 'production') throw new Error('почта не настроена');
    console.info(`[mail] код входа для ${email}: ${code}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [email],
      subject: `${code} — код входа в Чек-ап`,
      text: `Код входа в Чек-ап: ${code}\n\nОн действует 10 минут. Если ты не запрашивал вход, просто не отвечай на это письмо.`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`почтовый сервис ответил ${res.status}`);
}
