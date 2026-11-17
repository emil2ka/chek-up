// Ошибки распознавания: код → понятный пользователю текст и HTTP-статус.
// Общий файл для сервера и клиента (без секретов).

export const SCAN_ERRORS = {
  not_receipt: { status: 422, message: 'Похоже, на фото не чек. Сфоткай кассовый чек целиком' },
  unreadable: { status: 422, message: 'Не получилось прочитать чек. Расправь его, включи свет и сними ближе' },
  empty: { status: 422, message: 'В чеке не нашлось товаров. Попробуй сфоткать ещё раз' },
  too_large: { status: 413, message: 'Фото слишком большое. Попробуй ещё раз' },
  bad_request: { status: 400, message: 'Не получилось отправить фото. Попробуй ещё раз' },
  rate_limit: { status: 429, message: 'Слишком много чеков подряд. Подожди минуту и попробуй снова' },
  unavailable: { status: 503, message: 'Сервис распознавания сейчас недоступен. Попробуй позже' },
} as const;

export type ScanErrorCode = keyof typeof SCAN_ERRORS;

export class ScanError extends Error {
  readonly code: ScanErrorCode;
  constructor(code: ScanErrorCode, detail?: string) {
    super(SCAN_ERRORS[code].message);
    this.name = 'ScanError';
    this.code = code;
    if (detail) this.cause = detail;
  }
  get status(): number {
    return SCAN_ERRORS[this.code].status;
  }
}

export const isScanErrorCode = (v: unknown): v is ScanErrorCode =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(SCAN_ERRORS, v);
