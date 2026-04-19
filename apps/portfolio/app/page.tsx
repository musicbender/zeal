import { getHomeProjects, getSectionById, getSkills, getTechSkills } from '@repo/remote-data';
import HomePage from './home-page';

export default async function Home() {
	const [techSkills, aboutSection, skillsSection, contactSection, skills, projects] =
		await Promise.all([
			getTechSkills(),
			getSectionById('about-me'),
			getSectionById('skills'),
			getSectionById('contact'),
			getSkills(),
			getHomeProjects(),
		]);

	const projectsList = projects.map((p) => ({
		slug: p.projectId,
		title: p.title,
		subtitle: p.subtitle,
	}));

	return (
		<HomePage
			skills={techSkills}
			drawerData={{
				about: aboutSection,
				contact: contactSection,
				skillsSection,
				skills: skills.map((s) => s.label),
				projects: projectsList,
			}}
		/>
	);
}
