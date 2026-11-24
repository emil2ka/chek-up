// Интеграционный тест на настоящем Postgres (PGlite в памяти): аккаунты, вход, семья, роли, синхронизация.
import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { addDays, todayIso, weekOf } from '@/lib/calendar';
import { SyncStateSchema, type HistorySync } from '@/lib/syncSchema';
import type { Receipt } from '@/lib/types';
import { openPglite, type Db } from './db';
import { devices, families, history as historyT, members, users } from './db/schema';
import { accountInfo, authenticate, checkEmailCode, createAnonymousUser, createLinkCode, deleteAccount, EMAIL_ATTEMPTS, exportData, issueEmailCode, redeemLinkCode, signIn, signOut, type Session } from './auth';
import { createInvite, joinFamily, leaveFamily, membershipOf, previewInvite, removeMember, setRole } from './family';
import { syncUser } from './sync';
import { consume } from './usage';

let db: Db;
const T = Date.now() - 3_600_000;
const WEEK = weekOf(todayIso());
beforeAll(async () => { db = await openPglite(); }, 60_000);

const req = (token?: string) => new Request('http://x/api/sync', { headers: token ? { authorization: `Bearer ${token}` } : {} });
const who = async (s: Session) => (await authenticate(db, req(s.token)))!;
const receipt = (id: string, over: Partial<Receipt> = {}): Receipt => ({ id, title: 'Фото', store: 'Small', date: WEEK, items: [{ n: 'Кола, 1 л', p: 600, s: 106 }], approx: true, ...over });
const entry = (id: string, updatedAt = T, extra: Partial<HistorySync> = {}): HistorySync =>
  ({ id, receiptId: 'scan-' + id, store: 'Small', date: WEEK, cubes: 21, score: 40, swaps: [], receipt: receipt('scan-' + id), updatedAt, ...extra });
const pull = (s: Session, since?: number, familyId?: string) => syncUser(db, s.userId, { since, familyId });
const guest = (label = 'phone') => createAnonymousUser(db, label);
const mail = (n: string) => `${n}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const login = async (s: Session | null, email: string) => signIn(db, { provider: 'email', subject: email, email }, s && await who(s), 'web');
/** семья: мама-владелец и ещё участники */
async function makeFamily(...roles: ('adult' | 'child')[]) {
  const mum = await guest('mum'), rest: Session[] = [];
  for (const role of roles) {
    const p = await guest(role);
    await joinFamily(db, p.userId, (await createInvite(db, await membershipOf(db, mum.userId), role)).code, true);
    rest.push(p);
  }
  return [mum, ...rest];
}

describe('устройства', () => {
  it('токен узнаётся, чужой и пустой — нет; в БД только хеш; у гостя сразу есть семья', async () => {
    const a = await guest('iPhone');
    expect(await authenticate(db, req(a.token))).toMatchObject({ userId: a.userId });
    expect(await authenticate(db, req('cu_' + 'x'.repeat(43)))).toBeNull();
    expect(await authenticate(db, req())).toBeNull();
    expect((await db.select().from(devices)).some(r => r.tokenHash === a.token)).toBe(false);
    expect(await membershipOf(db, a.userId)).toMatchObject({ role: 'owner' });
  });

  it('код связывает устройства и одноразовый; чеки гостя переезжают', async () => {
    const phone = await guest('phone'), web = await guest('web');
    await syncUser(db, phone.userId, { history: [entry('p')] });
    await syncUser(db, web.userId, { history: [entry('w')] });
    const { code } = await createLinkCode(db, phone.userId);
    const s = (await redeemLinkCode(db, code.toLowerCase(), 'web', await who(web)))!;
    expect(s.userId).toBe(phone.userId);
    expect((await pull(s)).history.map(h => h.id).sort()).toEqual(['p', 'w']);
    expect(await authenticate(db, req(web.token))).toBeNull(); // старый гостевой токен больше не работает
    expect(await redeemLinkCode(db, code)).toBeNull();
    expect(await redeemLinkCode(db, 'ZZZZ-ZZZZ')).toBeNull();
  });

  it('выход: одно устройство, остальные, все', async () => {
    const a = await guest('1');
    const b = (await redeemLinkCode(db, (await createLinkCode(db, a.userId)).code, '2'))!;
    const c = (await redeemLinkCode(db, (await createLinkCode(db, a.userId)).code, '3'))!;
    const list = (await accountInfo(db, await who(a))).devices;
    expect(list).toHaveLength(3);
    expect(list.filter(d => d.current)).toHaveLength(1);
    await signOut(db, await who(a), list.find(d => d.label === '3')!.id);
    expect(await authenticate(db, req(c.token))).toBeNull();
    await signOut(db, await who(a), 'others');
    expect(await authenticate(db, req(b.token))).toBeNull();
    expect(await authenticate(db, req(a.token))).not.toBeNull();
  });

  it('чужое устройство по id не отключить', async () => {
    const a = await guest(), b = await guest();
    const bDev = (await accountInfo(db, await who(b))).devices[0].id;
    await signOut(db, await who(a), bDev);
    expect(await authenticate(db, req(b.token))).not.toBeNull();
  });
});

describe('вход по почте', () => {
  it('код подходит один раз, повторный запрос слишком скоро не выдаётся', async () => {
    const e = mail('once');
    const code = (await issueEmailCode(db, e))!;
    expect(code).toMatch(/^\d{6}$/);
    expect(await issueEmailCode(db, e)).toBeNull();
    expect(await checkEmailCode(db, e, code)).toBe(true);
    expect(await checkEmailCode(db, e, code)).toBe(false);
  });
  it('после пяти неверных попыток не подходит даже верный', async () => {
    const e = mail('brute');
    const code = (await issueEmailCode(db, e))!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < EMAIL_ATTEMPTS; i++) expect(await checkEmailCode(db, e, wrong)).toBe(false);
    expect(await checkEmailCode(db, e, code)).toBe(false);
  });
  it('просроченный код не подходит', async () => {
    const e = mail('late');
    const code = (await issueEmailCode(db, e))!;
    expect(await checkEmailCode(db, e, code, Date.now() + 11 * 60_000)).toBe(false);
  });

  it('гость получает вход и сохраняет чеки; со второго устройства открывается тот же аккаунт', async () => {
    const e = mail('anna'), phone = await guest();
    await syncUser(db, phone.userId, { history: [entry('old')] });
    const s1 = await login(phone, e);
    expect(s1).toMatchObject({ userId: phone.userId, created: true });
    const other = await guest('tablet');
    await syncUser(db, other.userId, { history: [entry('tab')] });
    const s2 = await login(other, e);
    expect(s2).toMatchObject({ userId: phone.userId, created: false });
    expect((await pull(s2)).history.map(h => h.id).sort()).toEqual(['old', 'tab']);
    expect((await db.select().from(users).where(eq(users.id, other.userId))).length).toBe(0);
  });

  it('аккаунт со своим входом не поглощается, а просто переключается', async () => {
    const a = await login(await guest(), mail('a')), eb = mail('b'), b = await login(await guest(), eb);
    await syncUser(db, a.userId, { history: [entry('mine')] });
    const s = await login(a, eb);
    expect(s.userId).toBe(b.userId);
    expect((await pull(s)).history).toHaveLength(0);
    expect((await pull(a)).history).toHaveLength(1);
  });

  it('Google с тем же подтверждённым адресом — тот же человек, без адреса — новый', async () => {
    const e = mail('g'), s = await login(await guest(), e);
    expect((await signIn(db, { provider: 'google', subject: 'sub-' + e, email: e }, null)).userId).toBe(s.userId);
    expect((await signIn(db, { provider: 'apple', subject: 'x-' + e, email: '' }, null)).userId).not.toBe(s.userId);
  });

  it('гостя из общей семьи молча не переносим', async () => {
    const e = mail('busy');
    await login(await guest(), e);
    const [, dad] = await makeFamily('adult');
    await expect(login(dad, e)).rejects.toMatchObject({ code: 'in_family' });
    expect(await authenticate(db, req(dad.token))).not.toBeNull();
  });
});

describe('синхронизация', () => {
  it('ответ по схеме, приходят только изменения, удаление доезжает', async () => {
    const a = await guest();
    const b = (await redeemLinkCode(db, (await createLinkCode(db, a.userId)).code, 'web'))!;
    const s1 = await syncUser(db, a.userId, { history: [entry('x'), entry('y')], shop: [{ name: 'Минералка', instead: 'Кола', done: false, updatedAt: T }] });
    expect(SyncStateSchema.safeParse(JSON.parse(JSON.stringify(s1))).success).toBe(true);
    const first = await pull(b);
    expect(first).toMatchObject({ full: true });
    expect(first.history).toHaveLength(2);

    const nothing = await pull(b, first.cursor, first.family.id);
    expect(nothing).toMatchObject({ full: false, cursor: first.cursor, history: [], shop: [] });

    await syncUser(db, a.userId, { history: [entry('x', T + 10, { deleted: true, receipt: null })] });
    const diff = await pull(b, first.cursor, first.family.id);
    expect(diff.history).toEqual([expect.objectContaining({ id: 'x', deleted: true, receipt: null })]);
    expect((await pull(b)).history.map(h => h.id)).toEqual(['y']); // в полном состоянии удалённых нет
  });

  it('старая правка не затирает новую, правка из будущего обрезается', async () => {
    const a = await guest();
    await syncUser(db, a.userId, { history: [entry('x', T + 100, { store: 'новый' })] });
    await syncUser(db, a.userId, { history: [entry('x', T, { store: 'старый' })] });
    expect((await pull(a)).history[0].store).toBe('новый');
    await syncUser(db, a.userId, { history: [entry('x', Date.now() + 1e9, { store: 'из будущего' })] });
    expect((await pull(a)).history[0].updatedAt).toBeLessThanOrEqual(Date.now() + 61_000);
  });

  it('журнал больше двухсот чеков хранится целиком', async () => {
    const a = await guest();
    for (let p = 0; p < 3; p++) await syncUser(db, a.userId, { history: Array.from({ length: 150 }, (_, i) => entry(`n${p}-${i}`)) });
    expect((await pull(a)).history).toHaveLength(450);
  }, 30_000);

  it('данные разных людей не пересекаются, курсор чужой семьи не подходит', async () => {
    const a = await guest(), b = await guest();
    const sa = await syncUser(db, a.userId, { history: [entry('same', T, { cubes: 11 })] });
    await syncUser(db, b.userId, { history: [entry('same', T, { cubes: 22 })] });
    expect((await pull(a)).history[0].cubes).toBe(11);
    expect((await pull(b)).history[0].cubes).toBe(22);
    expect((await pull(b, sa.cursor, sa.family.id)).full).toBe(true);
  });

  it('одновременные правки двух устройств не теряются', async () => {
    const a = await guest(), start = await pull(a);
    await Promise.all(Array.from({ length: 12 }, (_, i) => syncUser(db, a.userId, { history: [entry('c' + i)] })));
    expect((await pull(a, start.cursor, start.family.id)).history).toHaveLength(12);
  });

  it('лимит за день общий и точный', async () => {
    const r = await Promise.all(Array.from({ length: 5 }, () => consume(db, 'scan:test', 3)));
    expect(r.filter(Boolean)).toHaveLength(3);
  });
});

describe('семья', () => {
  it('приглашение: предпросмотр, вступление, общий журнал', async () => {
    const mum = await guest(), dad = await guest();
    await syncUser(db, mum.userId, { history: [entry('m')] });
    await syncUser(db, dad.userId, { history: [entry('d')] });
    const { code } = await createInvite(db, await membershipOf(db, mum.userId), 'adult');
    expect(await previewInvite(db, code)).toMatchObject({ role: 'adult', members: 1 });
    const before = await membershipOf(db, dad.userId);
    await joinFamily(db, dad.userId, code, true);
    const sm = await pull(mum);
    expect(sm.history.map(h => h.id).sort()).toEqual(['d', 'm']);
    expect(sm.history.find(h => h.id === 'd')!.by).toBe(dad.userId);
    expect(sm.family.members.map(m => m.role)).toEqual(['owner', 'adult']);
    expect((await db.select().from(families).where(eq(families.id, before.familyId))).length).toBe(0);
    await expect(joinFamily(db, (await guest()).userId, code, true)).rejects.toMatchObject({ code: 'bad_code' });
  });

  it('вступил без «поделиться» — чеки не пропали, но видны только ему', async () => {
    const mum = await guest(), dad = await guest();
    await syncUser(db, dad.userId, { history: [entry('secret')] });
    await joinFamily(db, dad.userId, (await createInvite(db, await membershipOf(db, mum.userId), 'adult')).code, false);
    expect((await pull(mum)).history).toHaveLength(0);
    expect((await pull(dad)).history).toEqual([expect.objectContaining({ id: 'secret', priv: true })]);
  });

  it('чек стал личным — у остальных исчез, чужой личный не перезаписать', async () => {
    const [mum, dad] = await makeFamily('adult');
    await syncUser(db, mum.userId, { history: [entry('gift')] });
    const seen = await pull(dad);
    await syncUser(db, mum.userId, { history: [entry('gift', T + 10, { priv: true })] });
    const diff = await pull(dad, seen.cursor, seen.family.id);
    expect(diff.history).toEqual([expect.objectContaining({ id: 'gift', deleted: true })]);
    expect(JSON.stringify(diff.history)).not.toContain('Кола');
    await syncUser(db, dad.userId, { history: [entry('gift', T + 20, { deleted: true })] });
    expect((await pull(mum)).history).toEqual([expect.objectContaining({ id: 'gift', priv: true })]);
  });

  it('ребёнок: без цен, не правит чужое, не закрывает неделю, не меняет семью, не зовёт', async () => {
    const [mum, kid] = await makeFamily('child');
    await syncUser(db, mum.userId, { history: [entry('m')], family: { adults: 2, kids: 1, goal: 10, updatedAt: T } });
    const sk = await pull(kid);
    expect(sk.history[0].receipt).toMatchObject({ masked: true });
    expect(sk.history[0].receipt!.items[0].p).toBe(0);
    await syncUser(db, kid.userId, {
      history: [entry('m', T + 50, { deleted: true }), entry('k')],
      weeks: [{ week: WEEK, state: 'closed', updatedAt: T }],
      family: { adults: 6, kids: 8, goal: 0, updatedAt: T + 50 },
    });
    const sm = await pull(mum);
    expect(sm.history.map(h => h.id).sort()).toEqual(['k', 'm']);
    expect(sm.history.find(h => h.id === 'm')!.receipt!.items[0].p).toBe(600);
    expect(sm.weeks).toEqual([]);
    expect(sm.family).toMatchObject({ adults: 2, kids: 1, goal: 10 });
    expect((await pull(kid)).history.find(h => h.id === 'k')!.receipt!.items[0].p).toBe(600); // свой чек видит целиком
    await expect(createInvite(db, await membershipOf(db, kid.userId), 'adult')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('замаскированная копия не может затереть оригинал', async () => {
    const [mum, kid] = await makeFamily('child');
    await syncUser(db, mum.userId, { history: [entry('m')] });
    await setRole(db, await membershipOf(db, mum.userId), kid.userId, 'adult'); // роль сменили, а на телефоне осталась старая копия
    const masked = { ...entry('m', T + 50), receipt: { ...receipt('scan-m'), masked: true } };
    await syncUser(db, kid.userId, { history: [masked] });
    expect((await pull(mum)).history[0].receipt!.masked).toBeUndefined();
  });

  it('выход: свои чеки со мной, общая копия остаётся, личная — нет', async () => {
    const [mum, dad] = await makeFamily('adult');
    await syncUser(db, dad.userId, { history: [entry('common'), entry('own', T, { priv: true })] });
    await leaveFamily(db, dad.userId);
    expect((await pull(dad)).history.map(h => h.id).sort()).toEqual(['common', 'own']);
    expect((await pull(mum)).history.map(h => h.id)).toEqual(['common']);
    expect((await membershipOf(db, dad.userId)).role).toBe('owner');
    const fam = (await membershipOf(db, mum.userId)).familyId;
    expect((await db.select().from(historyT).where(eq(historyT.familyId, fam))).length).toBe(1);
    await expect(leaveFamily(db, mum.userId)).rejects.toMatchObject({ code: 'alone' });
  });

  it('владелец ушёл — владельцем становится взрослый, а не ребёнок', async () => {
    const [mum, kid, dad] = await makeFamily('child', 'adult');
    await leaveFamily(db, mum.userId);
    expect((await membershipOf(db, dad.userId)).role).toBe('owner');
    expect((await membershipOf(db, kid.userId)).role).toBe('child');
  });

  it('роли меняет и убирает только владелец; владелец один', async () => {
    const [mum, dad, gran] = await makeFamily('adult', 'adult');
    await expect(setRole(db, await membershipOf(db, dad.userId), gran.userId, 'child')).rejects.toMatchObject({ code: 'forbidden' });
    await setRole(db, await membershipOf(db, mum.userId), dad.userId, 'owner');
    expect((await membershipOf(db, mum.userId)).role).toBe('adult');
    await removeMember(db, await membershipOf(db, dad.userId), gran.userId);
    expect((await pull(dad)).family.members).toHaveLength(2);
    const stranger = await guest();
    await expect(removeMember(db, await membershipOf(db, dad.userId), stranger.userId)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('стрик на сервере', () => {
  it('закрытая неделя засчитывается всей семье, старая и будущая — нет', async () => {
    const [mum, dad] = await makeFamily('adult');
    await syncUser(db, dad.userId, { history: [entry('r')] });
    const s = await syncUser(db, mum.userId, { weeks: [
      { week: WEEK, state: 'closed', updatedAt: T }, { week: addDays(WEEK, -28), state: 'none', updatedAt: T }, { week: addDays(WEEK, 7), state: 'none', updatedAt: T },
    ] });
    expect(s.weeks.map(w => w.week)).toEqual([WEEK]);
    expect(s.streak).toMatchObject({ current: 1, best: 1 });
    expect((await pull(dad)).streak.current).toBe(1);
  });
  it('удалили последний чек недели — она перестаёт считаться, рекорд остаётся личным', async () => {
    const a = await guest();
    await syncUser(db, a.userId, { history: [entry('r')], weeks: [{ week: WEEK, state: 'closed', updatedAt: T }] });
    const s = await syncUser(db, a.userId, { history: [entry('r', T + 5, { deleted: true })] });
    expect(s.streak.current).toBe(0);
    expect(s.stats.bestWeeks).toBe(1);
  });
});

describe('мои данные', () => {
  it('выгрузка содержит только своё', async () => {
    const [mum, dad] = await makeFamily('adult');
    await syncUser(db, mum.userId, { history: [entry('m')] });
    await syncUser(db, dad.userId, { history: [entry('d')] });
    expect((await exportData(db, await who(dad))).receipts.map(r => r.id)).toEqual(['d']);
  });
  it('удаление одиночки стирает всё', async () => {
    const a = await guest();
    await syncUser(db, a.userId, { history: [entry('r')] });
    const fam = (await membershipOf(db, a.userId)).familyId;
    await deleteAccount(db, a.userId);
    expect(await authenticate(db, req(a.token))).toBeNull();
    expect((await db.select().from(families).where(eq(families.id, fam))).length).toBe(0);
    expect((await db.select().from(historyT).where(eq(historyT.familyId, fam))).length).toBe(0);
  });
  it('удаление из семьи: общие чеки остаются без автора, личные стираются, семья жива', async () => {
    const [mum, dad] = await makeFamily('adult');
    await syncUser(db, mum.userId, { history: [entry('common'), entry('own', T, { priv: true })] });
    await deleteAccount(db, mum.userId);
    const s = await pull(dad);
    expect(s.history.map(h => h.id)).toEqual(['common']);
    expect(s.history[0].by).toBeUndefined();
    expect(s.me.role).toBe('owner');
    expect((await db.select().from(members).where(eq(members.userId, mum.userId))).length).toBe(0);
  });
});
