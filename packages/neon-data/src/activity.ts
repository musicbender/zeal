import 'server-only';

import { sql } from './client';
import type { CreateActivityDto, UpdateActivityDto } from './dtos';
import type { Activity } from './types';

export async function getActivityForToday(): Promise<Activity[]> {
  const rows = await sql()`
    SELECT *
    FROM activity
    WHERE sampled_on::date = CURRENT_DATE
    ORDER BY sampled_on DESC
  `;
  return rows as Activity[];
}

export async function getActivityLast30Days(): Promise<Activity[]> {
  const rows = await sql()`
    SELECT *
    FROM activity
    WHERE sampled_on >= NOW() - INTERVAL '30 days'
    ORDER BY sampled_on DESC
  `;
  return rows as Activity[];
}

export async function createActivity(dto: CreateActivityDto): Promise<Activity> {
  const rows = await sql()`
    INSERT INTO activity (sampled_on, step_count, exercise_minutes, calories_burned, minutes_standing)
    VALUES (${dto.sampled_on}, ${dto.step_count}, ${dto.exercise_minutes}, ${dto.calories_burned}, ${dto.minutes_standing})
    RETURNING *
  `;
  return rows[0] as Activity;
}

export async function updateActivity(id: number, dto: UpdateActivityDto): Promise<Activity | null> {
  const rows = await sql()`
    UPDATE activity SET
      sampled_on       = COALESCE(${dto.sampled_on ?? null}, sampled_on),
      step_count       = COALESCE(${dto.step_count ?? null}, step_count),
      exercise_minutes = COALESCE(${dto.exercise_minutes ?? null}, exercise_minutes),
      calories_burned  = COALESCE(${dto.calories_burned ?? null}, calories_burned),
      minutes_standing = COALESCE(${dto.minutes_standing ?? null}, minutes_standing)
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as Activity) ?? null;
}

export async function deleteActivity(id: number): Promise<boolean> {
  const rows = await sql()`
    DELETE FROM activity WHERE id = ${id} RETURNING id
  `;
  return rows.length > 0;
}
