export interface Activity {
	id: number;
	created_on: Date;
	sampled_on: Date;
	step_count: number;
	exercise_minutes: number;
	calories_burned: string; // NUMERIC returned as string from postgres
	minutes_standing: number;
}

export interface Ring {
	id: number;
	name: string | null;
	description: string | null;
	base_material: string | null;
	other_materials: string[];
	techniques: string[];
	gemstones: string[];
	size: string | null; // NUMERIC(5,2) returned as string from postgres
	weight_grams: string | null; // NUMERIC(8,2) returned as string from postgres
	images: string[];
	created_on: Date;
}
