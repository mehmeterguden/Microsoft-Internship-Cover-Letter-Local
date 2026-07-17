/**
 * Curated, offline suggestion lists for the profile forms. Bundled (no runtime
 * network call — privacy-first). Users can always type a custom value; these
 * just make the common answers one tap away.
 */

export const DEGREES: string[] = [
  "High School Diploma", "Associate", "B.S.", "B.A.", "B.Sc.", "B.Eng.", "B.Tech", "B.Com", "LL.B.",
  "M.S.", "M.A.", "M.Sc.", "M.Eng.", "M.Tech", "MBA", "LL.M.", "M.Phil.",
  "Ph.D.", "Doctorate", "MD", "Postdoc", "Bootcamp", "Certificate", "Diploma",
];

export const SKILL_CATEGORIES: string[] = [
  "Languages", "Frameworks", "Libraries", "Databases", "DevOps", "Cloud", "Tools",
  "Testing", "Data & ML", "AI / LLM", "Frontend", "Backend", "Mobile", "Design",
  "Security", "Systems", "Soft skills", "Other",
];

export const FIELDS_OF_STUDY: string[] = [
  "Computer Engineering", "Computer Science", "Software Engineering", "Information Systems",
  "Information Technology", "Data Science", "Artificial Intelligence", "Machine Learning",
  "Cybersecurity", "Electrical Engineering", "Electronics Engineering", "Electrical & Electronics Engineering",
  "Mechanical Engineering", "Mechatronics Engineering", "Civil Engineering", "Industrial Engineering",
  "Aerospace Engineering", "Biomedical Engineering", "Chemical Engineering", "Environmental Engineering",
  "Mathematics", "Applied Mathematics", "Statistics", "Physics", "Chemistry", "Biology", "Biotechnology",
  "Economics", "Business Administration", "Finance", "Accounting", "Marketing", "Management",
  "Management Information Systems", "Psychology", "Sociology", "Political Science",
  "International Relations", "Law", "Medicine", "Nursing", "Pharmacy", "Architecture",
  "Graphic Design", "Industrial Design", "Interaction Design", "Communications", "Journalism",
  "Linguistics", "English Language & Literature", "Education", "Philosophy", "History",
];

export const LANGUAGES: string[] = [
  "English", "Turkish", "Spanish", "French", "German", "Italian", "Portuguese", "Dutch",
  "Russian", "Ukrainian", "Polish", "Czech", "Romanian", "Greek", "Hungarian", "Swedish",
  "Norwegian", "Danish", "Finnish", "Arabic", "Hebrew", "Persian", "Urdu", "Hindi", "Bengali",
  "Punjabi", "Tamil", "Telugu", "Chinese (Mandarin)", "Chinese (Cantonese)", "Japanese", "Korean",
  "Vietnamese", "Thai", "Indonesian", "Malay", "Filipino", "Swahili", "Amharic", "Azerbaijani",
  "Georgian", "Armenian", "Kazakh", "Uzbek", "Serbian", "Croatian", "Bulgarian", "Slovak",
  "Catalan", "Basque", "Irish", "Welsh", "Icelandic", "Afrikaans",
];

export const COUNTRIES: string[] = [
  "Turkey", "United States", "United Kingdom", "Germany", "France", "Netherlands", "Ireland",
  "Spain", "Italy", "Portugal", "Switzerland", "Austria", "Belgium", "Sweden", "Norway",
  "Denmark", "Finland", "Poland", "Czechia", "Romania", "Greece", "Hungary", "Ukraine",
  "Russia", "Canada", "Mexico", "Brazil", "Argentina", "Chile", "Colombia", "Australia",
  "New Zealand", "Japan", "South Korea", "China", "Hong Kong", "Singapore", "India", "Pakistan",
  "Bangladesh", "Indonesia", "Malaysia", "Philippines", "Vietnam", "Thailand", "United Arab Emirates",
  "Saudi Arabia", "Qatar", "Israel", "Egypt", "South Africa", "Nigeria", "Kenya", "Morocco",
  "Remote", "Hybrid",
];

/** Common technologies / tools — used for skill names and project tech tags. */
export const TECHNOLOGIES: string[] = [
  // languages
  "JavaScript", "TypeScript", "Python", "Java", "C", "C++", "C#", "Go", "Rust", "Kotlin", "Swift",
  "Ruby", "PHP", "Scala", "Dart", "R", "MATLAB", "SQL", "Bash", "PowerShell", "Elixir", "Haskell",
  // frontend
  "React", "Next.js", "Vue", "Nuxt", "Angular", "Svelte", "SvelteKit", "Solid", "Astro",
  "HTML5", "CSS3", "Sass", "Tailwind CSS", "Bootstrap", "Material UI", "Redux", "Zustand", "Vite",
  "Webpack", "jQuery", "AJAX", "Chart.js", "D3.js", "Three.js", "Framer Motion",
  // backend / api
  "Node.js", "Express", "NestJS", "FastAPI", "Django", "Flask", "Spring Boot", "Ruby on Rails",
  "Laravel", "ASP.NET Core", ".NET", "GraphQL", "REST APIs", "gRPC", "WebSockets", "OAuth2", "JWT",
  // databases
  "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Elasticsearch", "Cassandra", "DynamoDB",
  "Firebase", "Supabase", "Prisma", "SQLAlchemy", "ChromaDB", "Pinecone", "pgvector",
  // devops / cloud
  "Docker", "Kubernetes", "Terraform", "Ansible", "Git", "GitHub Actions", "GitLab CI", "Jenkins",
  "AWS", "Azure", "Google Cloud", "Vercel", "Netlify", "Cloudflare", "Nginx", "Linux",
  // data / ml / ai
  "NumPy", "Pandas", "scikit-learn", "PyTorch", "TensorFlow", "Keras", "Hugging Face", "LangChain",
  "OpenAI API", "Anthropic Claude", "Google Gemini", "Ollama", "spaCy", "OpenCV", "Jupyter",
  "sentence-transformers", "RAG", "Apache Spark", "Airflow", "dbt", "Tableau", "Power BI",
  // mobile / other
  "React Native", "Flutter", "SwiftUI", "Android", "iOS", "Electron", "Figma", "Postman", "Jira",
  "Jest", "Vitest", "Playwright", "Cypress", "pytest", "Selenium",
];

/** Common certificate / course issuers. */
export const CERT_ISSUERS: string[] = [
  "Coursera", "Udemy", "edX", "Udacity", "Pluralsight", "LinkedIn Learning", "DataCamp", "Codecademy",
  "freeCodeCamp", "Kaggle", "Google", "Microsoft", "Amazon Web Services (AWS)", "Google Cloud",
  "Meta", "IBM", "Oracle", "Cisco", "CompTIA", "HashiCorp", "Docker", "Kubernetes (CNCF)",
  "Scrum.org", "Scrum Alliance", "PMI", "DeepLearning.AI", "NVIDIA", "MongoDB University",
  "Hugging Face", "Anthropic", "OpenAI",
];

/** A curated set of well-known universities (custom values still allowed). */
export const UNIVERSITIES: string[] = [
  // Türkiye
  "Boğaziçi University", "Middle East Technical University (METU)", "Istanbul Technical University (ITU)",
  "Bilkent University", "Koç University", "Sabancı University", "Hacettepe University",
  "Istanbul University", "Ege University", "Ankara University", "Yıldız Technical University",
  "Gazi University", "Çankaya University", "Dokuz Eylül University", "Marmara University",
  // global
  "Massachusetts Institute of Technology (MIT)", "Stanford University", "Harvard University",
  "University of California, Berkeley", "Carnegie Mellon University", "California Institute of Technology (Caltech)",
  "University of Oxford", "University of Cambridge", "Imperial College London", "ETH Zurich",
  "EPFL", "University of Toronto", "University of Waterloo", "National University of Singapore (NUS)",
  "Technical University of Munich (TUM)", "Delft University of Technology", "KTH Royal Institute of Technology",
  "Georgia Institute of Technology", "University of Illinois Urbana-Champaign", "University of Michigan",
  "Cornell University", "Princeton University", "Yale University", "Columbia University",
];

/** Map a list of plain strings into {value,label} options. */
export const toOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
