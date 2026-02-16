export interface Project {
	slug: string;
	name: string;
	subtitle: string;
	icon: { rects: { x: number; y: number; w: number; h: number; fill: string }[] };
	year: string;
	duration: string;
	role: string;
	overview: string[];
	sections: {
		title: string;
		content: string[];
		hasScreenshots?: boolean;
	}[];
	tech: string[];
	team: { name: string; role: string }[];
}

export const projects: Project[] = [
	{
		slug: 'neural-canvas',
		name: 'Neural Canvas',
		subtitle: 'AI-Powered Design Tool',
		icon: {
			rects: [
				{ x: 3, y: 3, w: 3, h: 3, fill: '#6a6a68' },
				{ x: 10, y: 3, w: 3, h: 3, fill: '#6a6a68' },
				{ x: 3, y: 10, w: 3, h: 3, fill: '#6a6a68' },
			],
		},
		year: '2024',
		duration: '6MO',
		role: 'LEAD',
		overview: [
			'Neural Canvas is an experimental design tool that uses machine learning to generate and manipulate visual compositions in real-time. Built as a proof of concept for AI-assisted creative workflows, it bridges the gap between traditional design tools and generative systems.',
			'The project started as an exploration into how neural networks could understand and interpret design principles. We trained custom models on thousands of design compositions, teaching the system to recognize patterns in color theory, spatial relationships, and compositional balance.',
		],
		sections: [
			{
				title: 'Interface',
				content: [
					'The interface takes a minimalist approach, focusing on direct manipulation and real-time feedback. Users can sketch rough ideas and watch as the AI interprets and refines them, suggesting color palettes, layout variations, and compositional improvements.',
				],
				hasScreenshots: true,
			},
			{
				title: 'Approach',
				content: [
					'We built a custom training pipeline using PyTorch to process design datasets. The model architecture combines CNN layers for visual feature extraction with transformer attention mechanisms for understanding compositional relationships.',
					'The frontend runs on React with a custom WebGL rendering engine for real-time canvas manipulation. We optimized for sub-100ms latency between user input and AI response, making the interaction feel immediate and natural.',
				],
			},
		],
		tech: ['React', 'TypeScript', 'PyTorch', 'FastAPI', 'WebGL', 'PostgreSQL', 'Docker', 'AWS'],
		team: [
			{ name: 'Pat Jacobs', role: 'LEAD ENG' },
			{ name: 'Alex Chen', role: 'ML ENG' },
			{ name: 'Jordan Kim', role: 'DESIGNER' },
			{ name: 'Sam Rivera', role: 'QA' },
		],
	},
	{
		slug: 'temporal-db',
		name: 'Temporal DB',
		subtitle: 'Time-Series Database Engine',
		icon: {
			rects: [
				{ x: 6, y: 2, w: 4, h: 4, fill: '#8a8a88' },
				{ x: 2, y: 6, w: 4, h: 4, fill: '#8a8a88' },
				{ x: 10, y: 10, w: 4, h: 4, fill: '#8a8a88' },
			],
		},
		year: '2023',
		duration: '8MO',
		role: 'ENG',
		overview: [
			'Temporal DB is a high-performance time-series database optimized for IoT sensor data and real-time analytics. It handles millions of data points per second with sub-millisecond query latency.',
			'Designed from the ground up to handle the unique challenges of time-series data including high write throughput, efficient compression, and time-based partitioning.',
		],
		sections: [
			{
				title: 'Architecture',
				content: [
					'The storage engine uses a custom LSM-tree variant optimized for time-ordered data. Write-ahead logging ensures durability while a tiered compaction strategy maintains read performance.',
				],
				hasScreenshots: true,
			},
			{
				title: 'Approach',
				content: [
					'Built with Rust for maximum performance and memory safety. The query engine supports a SQL-like syntax with time-series specific extensions for windowed aggregations and downsampling.',
				],
			},
		],
		tech: ['Rust', 'TypeScript', 'React', 'gRPC', 'Protobuf', 'Docker', 'Kubernetes'],
		team: [
			{ name: 'Pat Jacobs', role: 'BACKEND ENG' },
			{ name: 'Maria Santos', role: 'LEAD ENG' },
			{ name: 'David Park', role: 'SRE' },
		],
	},
	{
		slug: 'flux-protocol',
		name: 'Flux Protocol',
		subtitle: 'Distributed Event Streaming',
		icon: {
			rects: [
				{ x: 2, y: 7, w: 5, h: 2, fill: '#6a6a68' },
				{ x: 9, y: 7, w: 5, h: 2, fill: '#6a6a68' },
				{ x: 7, y: 2, w: 2, h: 5, fill: '#6a6a68' },
			],
		},
		year: '2023',
		duration: '4MO',
		role: 'LEAD',
		overview: [
			'Flux Protocol is a lightweight event streaming platform designed for microservice architectures. It provides exactly-once delivery semantics with minimal operational overhead.',
			'Born from the frustration of complex Kafka deployments, Flux offers a simpler mental model while maintaining the reliability guarantees needed for production workloads.',
		],
		sections: [
			{
				title: 'Design',
				content: [
					'The protocol uses a novel consensus mechanism that trades some throughput for dramatically simpler operations. Topics are partitioned across a cluster with automatic rebalancing.',
				],
				hasScreenshots: true,
			},
			{
				title: 'Approach',
				content: [
					'Implemented in Go for its excellent concurrency primitives. The client SDKs are available in TypeScript, Python, and Java with idiomatic APIs for each language.',
				],
			},
		],
		tech: ['Go', 'TypeScript', 'Python', 'gRPC', 'Raft', 'Docker', 'Prometheus'],
		team: [
			{ name: 'Pat Jacobs', role: 'LEAD ENG' },
			{ name: 'Chris Lee', role: 'DISTRIBUTED SYS' },
		],
	},
	{
		slug: 'mesh-router',
		name: 'Mesh Router',
		subtitle: 'Service Mesh Control Plane',
		icon: {
			rects: [
				{ x: 4, y: 4, w: 3, h: 3, fill: '#8a8a88' },
				{ x: 9, y: 4, w: 3, h: 3, fill: '#8a8a88' },
				{ x: 4, y: 9, w: 3, h: 3, fill: '#8a8a88' },
				{ x: 9, y: 9, w: 3, h: 3, fill: '#8a8a88' },
			],
		},
		year: '2022',
		duration: '10MO',
		role: 'ENG',
		overview: [
			'Mesh Router is a lightweight service mesh control plane that provides traffic management, observability, and security for Kubernetes-native applications.',
			'It was designed to be a simpler alternative to Istio, focusing on the 80% of features that 95% of teams actually need.',
		],
		sections: [
			{
				title: 'Features',
				content: [
					'Automatic mTLS between services, traffic splitting for canary deployments, circuit breaking, and distributed tracing. All configured through Kubernetes CRDs.',
				],
				hasScreenshots: true,
			},
			{
				title: 'Approach',
				content: [
					'The data plane uses Envoy proxies managed by a custom Go control plane. The dashboard is built with React and provides real-time service topology visualization.',
				],
			},
		],
		tech: ['Go', 'React', 'TypeScript', 'Envoy', 'Kubernetes', 'Prometheus', 'Grafana'],
		team: [
			{ name: 'Pat Jacobs', role: 'FRONTEND ENG' },
			{ name: 'Aisha Patel', role: 'LEAD ENG' },
			{ name: 'Tom Wu', role: 'PLATFORM ENG' },
			{ name: 'Nina Okafor', role: 'SRE' },
		],
	},
	{
		slug: 'quantum-metrics',
		name: 'Quantum Metrics',
		subtitle: 'Real-Time Analytics Platform',
		icon: {
			rects: [
				{ x: 3, y: 5, w: 3, h: 6, fill: '#6a6a68' },
				{ x: 10, y: 3, w: 3, h: 10, fill: '#6a6a68' },
			],
		},
		year: '2022',
		duration: '5MO',
		role: 'ENG',
		overview: [
			'Quantum Metrics is a real-time analytics platform that processes and visualizes millions of events per second. It provides instant insights into user behavior and system performance.',
			'The platform was built to replace a legacy batch-processing pipeline, reducing insight latency from hours to seconds.',
		],
		sections: [
			{
				title: 'Dashboard',
				content: [
					'The dashboard supports custom widget layouts, real-time streaming charts, and collaborative annotations. Built with a focus on data density without sacrificing readability.',
				],
				hasScreenshots: true,
			},
			{
				title: 'Approach',
				content: [
					'The ingestion pipeline uses Apache Flink for stream processing with a custom sink to ClickHouse for analytical queries. The frontend uses WebSockets for real-time data streaming.',
				],
			},
		],
		tech: [
			'React',
			'TypeScript',
			'Apache Flink',
			'ClickHouse',
			'Kafka',
			'WebSockets',
			'D3.js',
		],
		team: [
			{ name: 'Pat Jacobs', role: 'FULLSTACK ENG' },
			{ name: 'Lisa Zhang', role: 'LEAD ENG' },
			{ name: 'Ryan Murphy', role: 'DATA ENG' },
		],
	},
];

export function getProject(slug: string): Project | undefined {
	return projects.find((p) => p.slug === slug);
}

export function getNextProject(slug: string): Project | undefined {
	const index = projects.findIndex((p) => p.slug === slug);
	if (index === -1) return undefined;
	return projects[(index + 1) % projects.length];
}
