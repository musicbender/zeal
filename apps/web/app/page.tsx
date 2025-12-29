import styles from './page.module.css';


export default async function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>Welcome to Zeal Monorepo!</h1>
      </main>
    </div>
  );
}
