import styles from './decorative-blocks.module.css';

interface DecorativeBlocksProps {
  count?: number;
}

export function DecorativeBlocks({ count = 8 }: DecorativeBlocksProps) {
  return (
    <div className={styles.blocks}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.block} />
      ))}
    </div>
  );
}
