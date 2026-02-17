import HomePage from './home-page';
import { getHomeProjects, getTechSkills } from '../lib/hygraph';
import { generateIcon } from '../lib/projects';

export default async function Home() {
	const [hygraphProjects, skills] = await Promise.all([getHomeProjects(), getTechSkills()]);

	const projects = hygraphProjects.map((p) => ({
		slug: p.projectId,
		name: p.title,
		icon: generateIcon(p.projectId),
	}));

	return <HomePage projects={projects} skills={skills} />;
}
