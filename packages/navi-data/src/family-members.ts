import 'server-only';

import { sql } from '@repo/neon-client';
import type { CreateFamilyMemberDto } from './dtos';
import type { FamilyMember } from './types';

export async function getAllFamilyMembers(): Promise<FamilyMember[]> {
	const rows = await sql()`
    SELECT * FROM family_members ORDER BY display_name ASC
  `;
	return rows as FamilyMember[];
}

export async function getFamilyMemberByDiscordId(
	discordUserId: string
): Promise<FamilyMember | null> {
	const rows = await sql()`
    SELECT * FROM family_members WHERE discord_user_id = ${discordUserId}
  `;
	return (rows[0] as FamilyMember) ?? null;
}

export async function createFamilyMember(dto: CreateFamilyMemberDto): Promise<FamilyMember> {
	const rows = await sql()`
    INSERT INTO family_members (discord_user_id, display_name, timezone)
    VALUES (${dto.discord_user_id}, ${dto.display_name}, ${dto.timezone})
    RETURNING *
  `;
	return rows[0] as FamilyMember;
}
