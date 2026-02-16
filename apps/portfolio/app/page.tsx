import HomePage from './HomePage';
import { projects } from '../lib/projects';

export default function Home() {
	return <HomePage projects={projects} />;
}
