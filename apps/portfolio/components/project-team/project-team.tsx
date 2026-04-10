import { Text } from '@radix-ui/themes';
import styles from './project-team.module.css';

interface ProjectTeamProps {
  members: string[];
}

export function ProjectTeam({ members }: ProjectTeamProps) {
  return (
    <div className={styles.teamGrid}>
      {members.map((member) => (
        <Text as="div" size="1" key={member} className={styles.teamMember}>
          {member}
        </Text>
      ))}
    </div>
  );
}
