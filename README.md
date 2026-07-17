[![CI](https://github.com/mehmeterguden/Microsoft-Internship-Cover-Letter-Local/actions/workflows/ci.yml/badge.svg)](https://github.com/mehmeterguden/Microsoft-Internship-Cover-Letter-Local/actions/workflows/ci.yml)

# Cover Letter Local

A privacy-first, fully local AI job-application assistant. Learns your writing
style, profiles your skills, researches companies, and generates personalized
cover letters — all running on your own machine.

> 🚧 **Early development.** Being built step by step. This README will be filled
> in (setup, screenshots, usage) once there's something to run.

## Stack

Python · FastAPI · ChromaDB · local LLM (Microsoft Foundry Local) · React · Vite · TypeScript

## License

MIT — see [LICENSE](LICENSE).

## Commit & PR policy

- Work on a feature branch → open a PR → **squash-merge**. Never commit directly to `main`.
- [Conventional Commits](https://www.conventionalcommits.org/), in English: `type(scope): subject`.
- **No AI is credited** as an author or co-author — commit messages must never contain a
  `Co-Authored-By: Claude` (or any AI) trailer. A `commit-msg` hook strips it automatically.

Enable the hook once after cloning:

    git config core.hooksPath .githooks
