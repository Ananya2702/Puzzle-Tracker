import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { listGoals, addGoal, deleteGoal, goalInputSchema } from '@/lib/goals-service';

describe('goals service', () => {
  it('add/list/delete with ownership', async () => {
    const db = await makeTestDb();
    const u = await createUser(db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
    const other = await createUser(db, { username: 'sam', email: 's@x.com', password: 'longenough' });
    await addGoal(db, u.id, { pieces: 500, target_time_seconds: 3000, description: 'sub-50min' });
    const goals = await listGoals(db, u.id);
    expect(goals).toHaveLength(1);
    expect(goals[0].achieved).toBe(false);
    expect(await deleteGoal(db, other.id, goals[0].id)).toBe(false);
    expect(await deleteGoal(db, u.id, goals[0].id)).toBe(true);
  });
  it('validates input', () => {
    expect(goalInputSchema.safeParse({ pieces: 0, target_time_seconds: 100 }).success).toBe(false);
    expect(goalInputSchema.safeParse({ pieces: 500, target_time_seconds: 100 }).success).toBe(true);
  });
});
