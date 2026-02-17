import styles from './project-team.module.css';

interface ProjectTeamProps {
  members: string[];
}

export function ProjectTeam({ members }: ProjectTeamProps) {
  return (
    <div className={styles.teamGrid}>
      {members.map((member) => (
        <div key={member} className={styles.teamMember}>
          <span>{member}</span>
        </div>
      ))}
    </div>
  );
}
