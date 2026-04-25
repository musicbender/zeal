import 'server-only';

import { sql } from '@repo/neon-client';
import type { CreateRingDto, UpdateRingDto } from './dtos';
import type { Ring } from './types';

export async function getAllRings(): Promise<Ring[]> {
	const rows = await sql()`
    SELECT * FROM rings ORDER BY created_on DESC
  `;
	return rows as Ring[];
}

export async function createRing(dto: CreateRingDto): Promise<Ring> {
	const rows = await sql()`
    INSERT INTO rings (
      name, description, base_material, other_materials,
      techniques, gemstones, size, weight_grams, images
    )
    VALUES (
      ${dto.name ?? null},
      ${dto.description ?? null},
      ${dto.base_material ?? null},
      ${dto.other_materials ?? []},
      ${dto.techniques ?? []},
      ${dto.gemstones ?? []},
      ${dto.size ?? null},
      ${dto.weight_grams ?? null},
      ${dto.images ?? []}
    )
    RETURNING *
  `;
	return rows[0] as Ring;
}

export async function updateRing(id: number, dto: UpdateRingDto): Promise<Ring | null> {
	const rows = await sql()`
    UPDATE rings SET
      name             = COALESCE(${dto.name ?? null}, name),
      description      = COALESCE(${dto.description ?? null}, description),
      base_material    = COALESCE(${dto.base_material ?? null}, base_material),
      other_materials  = COALESCE(${dto.other_materials ?? null}, other_materials),
      techniques       = COALESCE(${dto.techniques ?? null}, techniques),
      gemstones        = COALESCE(${dto.gemstones ?? null}, gemstones),
      size             = COALESCE(${dto.size ?? null}, size),
      weight_grams     = COALESCE(${dto.weight_grams ?? null}, weight_grams),
      images           = COALESCE(${dto.images ?? null}, images)
    WHERE id = ${id}
    RETURNING *
  `;
	return (rows[0] as Ring) ?? null;
}

export async function deleteRing(id: number): Promise<boolean> {
	const rows = await sql()`
    DELETE FROM rings WHERE id = ${id} RETURNING id
  `;
	return rows.length > 0;
}
