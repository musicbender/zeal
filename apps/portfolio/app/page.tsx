import HomePage from './home-page';
import { projects } from '../lib/projects';

export default function Home() {
	return <HomePage projects={projects} />;
}
