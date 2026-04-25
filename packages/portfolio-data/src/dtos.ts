export interface CreateActivityDto {
	sampled_on: string; // ISO 8601 timestamp
	step_count: number;
	exercise_minutes: number;
	calories_burned: number;
	minutes_standing: number;
}

export interface UpdateActivityDto {
	sampled_on?: string;
	step_count?: number;
	exercise_minutes?: number;
	calories_burned?: number;
	minutes_standing?: number;
}

export interface CreateRingDto {
	name?: string;
	description?: string;
	base_material?: string;
	other_materials?: string[];
	techniques?: string[];
	gemstones?: string[];
	size?: number;
	weight_grams?: number;
	images?: string[];
}

export interface UpdateRingDto {
	name?: string;
	description?: string;
	base_material?: string;
	other_materials?: string[];
	techniques?: string[];
	gemstones?: string[];
	size?: number;
	weight_grams?: number;
	images?: string[];
}
