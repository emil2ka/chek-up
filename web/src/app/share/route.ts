// Сюда система отправляет фото из «Поделиться» (share_target в manifest.ts). Обычно запрос перехватывает sw.js;
// если он ещё не установился, просто открываем приложение.
export const POST = (request: Request) => Response.redirect(new URL('/', request.url), 303);
