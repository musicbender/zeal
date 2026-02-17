import { notFound } from 'next/navigation';
import ProjectPage from './project-page';
import { getAllProjects, getNextProject, getProjectBySlug } from '../../../lib/hygraph';
import { generateIcon } from '../../../lib/projects';

export async function generateStaticParams() {
	const projects = await getAllProjects();
	return projects.map((project) => ({ slug: project.projectId }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const project = await getProjectBySlug(slug);
	if (!project) return {};
	return {
		title: `${project.title} — Pat Jacobs`,
		description: project.description,
	};
}

export default async function ProjectDetailPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const [project, allProjects] = await Promise.all([getProjectBySlug(slug), getAllProjects()]);
	if (!project) notFound();

	const next = await getNextProject(project.order!, allProjects);

	const projectData = {
		...project,
		icon: generateIcon(project.projectId),
		year: project.projectPublishDate ? new Date(project.projectPublishDate).getFullYear().toString() : null,
	};

	const nextProjectData = next
		? {
				slug: next.projectId,
				name: next.title,
				icon: generateIcon(next.projectId),
			}
		: null;

	return <ProjectPage project={projectData} nextProject={nextProjectData} />;
}
