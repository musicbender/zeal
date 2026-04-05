import { config as loadDotenv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function globalSetup() {
  // .env.development.local is created by pull-env.sh when the portfolio dev server starts.
  // Loading here (after webServer is ready) guarantees the file exists.
  loadDotenv({ path: path.resolve(__dirname, '../../portfolio/.env.development.local') });
}
