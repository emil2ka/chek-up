// Что известно о семье и стрике с последней синхронизации, и отметки недель. Только для клиентских компонентов.
import { z } from 'zod';
import { dirty } from './dirty';
import { createStore } from './persist';
import { StreakSchema, MemberSchema, RoleSchema, WeekSyncSchema, type Member, type RoleName } from './syncSchema';
import type { Streak, WeekMark } from './streak';

export type FamilyState = { id: string; name: string; members: Member[]; me: { id: string; name: string; email: string; role: RoleName }; streak: Streak | null; bestWeeks: number };
const EMPTY: FamilyState = { id: '', name: '', members: [], me: { id: '', name: '', email: '', role: 'owner' }, streak: null, bestWeeks: 0 };
const Schema = z.object({
  id: z.string(), name: z.string(), members: z.array(MemberSchema),
  me: z.object({ id: z.string(), name: z.string(), email: z.string(), role: RoleSchema }),
  streak: StreakSchema.nullable(), bestWeeks: z.number(),
});
export const familyStore = createStore<FamilyState>('chekup.family', raw => { const p = Schema.safeParse(raw); return p.success ? (p.data as FamilyState) : EMPTY; }, EMPTY);

const marksStore = createStore<WeekMark[]>('chekup.weeks', raw => { const p = z.array(WeekSyncSchema).safeParse(raw); return p.success ? p.data : []; }, []);
export const weekMarks = {
  ...marksStore,
  setState(week: string, state: WeekMark['state']): void {
    const at = Math.max(Date.now(), (marksStore.get().find(m => m.week === week)?.updatedAt ?? 0) + 1);
    dirty.mark(`w:${week}`, at);
    marksStore.update(list => [...list.filter(m => m.week !== week), { week, state, updatedAt: at }].sort((a, b) => a.week.localeCompare(b.week)));
  },
  /** Сервер присылает все недели семьи; свои неподтверждённые оставляем. */
  applyRemote(list: WeekMark[]): void {
    const own = marksStore.get().filter(m => dirty.at(`w:${m.week}`) !== undefined);
    const ids = new Set(own.map(m => m.week));
    marksStore.set([...list.filter(m => !ids.has(m.week)), ...own].sort((a, b) => a.week.localeCompare(b.week)));
  },
};
