import { notFound } from 'next/navigation';
import ProjectPage from './ProjectPage';
import { getNextProject, getProject, projects } from '../../../lib/projects';

export function generateStaticParams() {
	return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const project = getProject(slug);
	if (!project) return {};
	return {
		title: `${project.name} — Pat Jacobs`,
		description: project.subtitle,
	};
}

export default async function ProjectDetailPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const project = getProject(slug);
	if (!project) notFound();

	const nextProject = getNextProject(slug)!;

	return <ProjectPage project={project} nextProject={nextProject} />;
}
