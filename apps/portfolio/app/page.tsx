import { getHomeProjects, getSectionById, getSkills, getTechSkills } from '@repo/remote-data';
import { contactEnabled } from '../lib/flags';
import HomePage from './home-page';

export default async function Home() {
	const [
		techSkills,
		aboutSection,
		skillsSection,
		contactSection,
		skills,
		projects,
		isContactEnabled,
	] = await Promise.all([
		getTechSkills(),
		getSectionById('about-me'),
		getSectionById('skills'),
		getSectionById('contact'),
		getSkills(),
		getHomeProjects(),
		contactEnabled(),
	]);

	const projectsList = projects.map((p) => ({
		slug: p.projectId,
		title: p.title,
		subtitle: p.subtitle,
	}));

	return (
		<HomePage
			skills={techSkills}
			contactEnabled={isContactEnabled}
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
