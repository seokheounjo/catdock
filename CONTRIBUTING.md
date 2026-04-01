# Contributing to CatDock

Thank you for your interest in contributing! CatDock is an open-source project and we welcome contributions of all kinds.

## How to Contribute

### Reporting Bugs
- Open an [Issue](https://github.com/seokheounjo/catdock/issues/new) with the `bug` label
- Include your OS version, Node.js version, and Claude CLI version
- Steps to reproduce the bug

### Suggesting Features
- Open an [Issue](https://github.com/seokheounjo/catdock/issues/new) with the `enhancement` label
- Describe the use case and expected behavior

### Submitting Code
1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Run checks: `pnpm typecheck && pnpm lint`
5. Commit with descriptive message
6. Push and open a Pull Request

### Development Setup
```bash
git clone https://github.com/YOUR_USERNAME/catdock.git
cd catdock
pnpm install
pnpm dev
```

### Code Style
- TypeScript strict mode
- Tailwind CSS for styling
- No unnecessary abstractions
- Keep PRs focused and small

### Project Structure
```
src/main/          # Electron main process (Node.js)
src/renderer/      # React UI (browser)
src/preload/       # Context bridge
src/shared/        # Shared types & constants
```

## Community
- [GitHub Discussions](https://github.com/seokheounjo/catdock/discussions) — Questions, ideas, show & tell
- [Issues](https://github.com/seokheounjo/catdock/issues) — Bug reports, feature requests
- [HuggingFace Space](https://huggingface.co/spaces/SoukHyoun/catdock) — Try it & leave feedback

## License
MIT — see [LICENSE](LICENSE) for details.
