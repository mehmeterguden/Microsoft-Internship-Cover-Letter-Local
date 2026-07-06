/** GitHub-style colors for common languages/technologies. Falls back to a neutral dot. */
const COLORS: Record<string, string> = {
  typescript: "#3178c6",
  javascript: "#f1e05a",
  python: "#3572A5",
  rust: "#dea584",
  go: "#00ADD8",
  java: "#b07219",
  "c++": "#f34b7d",
  c: "#555555",
  "c#": "#178600",
  ruby: "#701516",
  php: "#4F5D95",
  swift: "#F05138",
  kotlin: "#A97BFF",
  dart: "#00B4AB",
  html: "#e34c26",
  css: "#563d7c",
  scss: "#c6538c",
  shell: "#89e051",
  vue: "#41b883",
  react: "#61dafb",
  svelte: "#ff3e00",
  dockerfile: "#384d54",
  lua: "#000080",
  "jupyter notebook": "#DA5B0B",
};

export function langColor(name: string): string {
  return COLORS[name.trim().toLowerCase()] ?? "#8a94a6";
}
