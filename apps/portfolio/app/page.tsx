import { getTechSkills } from '@repo/remote-data';
import HomePage from './home-page';

export default async function Home() {
	const skills = await getTechSkills();

	return <HomePage skills={skills} />;
}
