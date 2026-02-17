import 'server-only';

import type { RichTextAST } from '@repo/utils/common/content';

const HYGRAPH_ENDPOINT = process.env.HYGRAPH_ENDPOINT!;

async function hygraphFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(HYGRAPH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 3600 },
  });

  const json = await res.json();
  if (json.errors) {
    throw new Error(json.errors.map((e: { message: string }) => e.message).join('\n'));
  }
  return json.data as T;
}

export interface HygraphProject {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  overview: string | null;
  projectType: 'Work' | 'Experiment';
  order: number | null;
  disabled: boolean | null;
  techList: string[];
  team: string[];
  externalUrl: string | null;
  githubRepoUrl: string | null;
  storybookUrl: string | null;
  linkType: 'Case_Study' | 'External' | null;
  projectPublishDate: string | null;
  lastDeployedOn: string | null;
  body: { raw: RichTextAST } | null;
}

export interface HygraphTechSkill {
  label: string;
  strength: number;
}

export async function getHomeProjects(): Promise<HygraphProject[]> {
  const data = await hygraphFetch<{ projects: HygraphProject[] }>(`
    query HomeProjects {
      projects(
        where: { disabled_not: true, order_lte: 5 }
        orderBy: order_ASC
        stage: PUBLISHED
        first: 5
      ) {
        id
        projectId
        title
        description
        order
        techList
        team
        externalUrl
        linkType
        projectPublishDate
      }
    }
  `);
  return data.projects;
}

export async function getAllProjects(): Promise<HygraphProject[]> {
  const data = await hygraphFetch<{ projects: HygraphProject[] }>(`
    query AllProjects {
      projects(
        where: { disabled_not: true, order_not: null }
        orderBy: order_ASC
        stage: PUBLISHED
      ) {
        id
        projectId
        title
        description
        order
        projectType
        techList
        team
        externalUrl
        githubRepoUrl
        storybookUrl
        linkType
        projectPublishDate
        lastDeployedOn
      }
    }
  `);
  return data.projects;
}

export async function getProjectBySlug(slug: string): Promise<HygraphProject | null> {
  const data = await hygraphFetch<{ projects: HygraphProject[] }>(
    `
    query ProjectBySlug($projectId: String!) {
      projects(where: { projectId: $projectId }, stage: PUBLISHED, first: 1) {
        id
        projectId
        title
        description
        overview
        projectType
        order
        disabled
        techList
        team
        externalUrl
        githubRepoUrl
        storybookUrl
        linkType
        projectPublishDate
        lastDeployedOn
        body {
          raw
        }
      }
    }
  `,
    { projectId: slug },
  );
  return data.projects[0] ?? null;
}

export async function getNextProject(
  currentOrder: number,
  allProjects: HygraphProject[],
): Promise<HygraphProject | null> {
  const sorted = allProjects.filter((p) => p.order != null).sort((a, b) => a.order! - b.order!);
  if (sorted.length === 0) return null;
  const currentIndex = sorted.findIndex((p) => p.order === currentOrder);
  const nextIndex = (currentIndex + 1) % sorted.length;
  return sorted[nextIndex] ?? null;
}

export async function getTechSkills(): Promise<HygraphTechSkill[]> {
  const data = await hygraphFetch<{ techSkills: HygraphTechSkill[] }>(`
    query TechSkills {
      techSkills(stage: PUBLISHED, first: 100) {
        label
        strength
      }
    }
  `);
  return data.techSkills;
}
