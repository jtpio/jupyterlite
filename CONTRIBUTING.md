# Contributing

Thanks for contributing to JupyterLite!

> We follow [Project Jupyter's Code of Conduct][coc] for a friendly and welcoming
> collaborative environment.

## Setup

### Get the Code

```bash
git clone https://github.com/jupyterlite/jupyterlite
cd jupyterlite
```

### Prerequisites

You'll need:

- `git`
- `nodejs >=24,<25`
- `jupyterlab >=4.6.0a0,<4.7`
- `python >=3.12,<3.13`

> **Tip**: You can use any Python package manager you prefer (`pip`, `conda`, etc.) for
> installing Python dependencies.

### Quick Start

Install all dependencies with a single command:

```bash
jlpm setup
```

This runs:

- `jlpm install` - Install Node.js dependencies
- `pip install --group dev --group test ...` - Install development dependencies and
  Python packages in editable mode

You can also install dependencies manually:

```bash
# Dev dependencies from root pyproject.toml (using dependency groups, PEP 735)
pip install --group dev              # Core dev tools
pip install --group dev --group test # Dev + testing
pip install --group docs             # Documentation tools

# Python packages in editable mode
pip install -e './py/jupyterlite-core[all,test]' -e ./py/jupyterlite
```

> **Note**: Dependency groups (PEP 735) require pip 24.1+ or
> [uv](https://docs.astral.sh/uv/).

Then build the project:

```bash
jlpm build
```

## Development Workflow

### Local Development

```bash
# Terminal 1: Build the site and serve it
jlpm dev:build && jlpm dev:serve

# Terminal 2: Watch and rebuild on changes (updates automatically)
jlpm dev:watch
```

This uses:

- `app/` as the built application source
- `examples/` as the lite directory (notebooks, config)
- `_site/` as the output directory (symlinked to `app/build/` for live updates)

| Command          | Description                                       |
| ---------------- | ------------------------------------------------- |
| `jlpm dev:build` | Build the JupyterLite site to `_site/`            |
| `jlpm dev:serve` | Serve `_site/` on http://localhost:8000           |
| `jlpm dev:watch` | Watch TypeScript and rebuild directly to `_site/` |

#### Adding Kernels and Extensions

Install kernels and extensions via pip - they'll be automatically included:

```bash
pip install jupyterlite-pyodide-kernel
jlpm dev:build  # Rebuilds site with the new kernel
```

### JavaScript/TypeScript Development

| Command           | Description                                 |
| ----------------- | ------------------------------------------- |
| `jlpm build`      | Build libraries and apps (development mode) |
| `jlpm build:prod` | Build for production                        |
| `jlpm watch`      | Watch mode - rebuilds on changes            |
| `jlpm test`       | Run JavaScript unit tests                   |
| `jlpm lint`       | Lint and format all code                    |
| `jlpm lint:check` | Check linting without fixing                |

### Python Development

| Command              | Description                                    |
| -------------------- | ---------------------------------------------- |
| `jlpm test:py`       | Run Python tests with coverage                 |
| `jlpm test:py:quick` | Run Python tests (fast, stop on first failure) |

### Documentation

| Command           | Description                         |
| ----------------- | ----------------------------------- |
| `jlpm docs:build` | Build Sphinx documentation          |
| `jlpm docs:serve` | Serve docs on http://localhost:8000 |
| `jlpm docs:watch` | Watch mode with auto-rebuild        |

### Building a Custom JupyterLite Site

You can also use the `jupyter lite` CLI directly for custom builds:

```bash
jupyter lite build --contents my-notebooks --output-dir my-site
jupyter lite serve --output-dir my-site
```

The `--app-archive` option accepts either an archive file or a directory:

```bash
# Use a directory as the app source (useful for development)
jupyter lite build --app-archive ./app --output-dir my-site
```

## Testing

### JavaScript Tests

```bash
jlpm build:test
jlpm test
```

### Python Tests

```bash
jlpm test:py
```

### UI Tests (Playwright)

JupyterLite uses [Galata](https://github.com/jupyterlab/jupyterlab/tree/master/galata)
for end-to-end and visual regression testing.

```bash
cd ui-tests
jlpm install
jlpm build
jlpm test
```

To run in headed mode:

```bash
jlpm test --headed
```

To update snapshots:

```bash
jlpm test:update
```

See [Playwright Command Line Reference](https://playwright.dev/docs/test-cli/) for more
options.

## Community Tasks

### Issues

JupyterLite features and bug fixes start as [issues] on GitHub.

- Look through existing issues (and [pull requests]!) to see if a related issue already
  exists
- If it is new:
  - Start a [new issue]
  - Pick an appropriate template
  - Fill out the template
  - Wait for the community to respond

### Pull Requests

JupyterLite features and fixes become _real_ as [pull requests].

> Pull requests are a great place to discuss work-in-progress, but it is **highly
> recommended** to create an [issue](#issues) before starting work so the community can
> weigh in on choices.

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `jlpm lint` to format code
4. Run tests: `jlpm test` and `jlpm test:py`
5. Push and open a pull request
   - Reference one or more [issues](#issues) so interested people can find your work
   - Use magic strings like `fixes #123` to automatically close issues

#### Previews

Each pull request is built and deployed on ReadTheDocs. You can view the live preview by
clicking on the ReadTheDocs check:

![rtd-pr-preview](https://user-images.githubusercontent.com/591645/119787419-78db1c80-bed1-11eb-9a60-5808fea59614.png)

#### Artifacts

Build artifacts are available from each run on the [Actions] page, including:

- test reports
- installable artifacts
- an app archive ready to use with the `jupyter lite` CLI

> You must be logged in to GitHub to download these.

[actions]: https://github.com/jupyterlite/jupyterlite/actions
[issues]: https://github.com/jupyterlite/jupyterlite/issues
[new issue]: https://github.com/jupyterlite/jupyterlite/issues/new
[pull requests]: https://github.com/jupyterlite/jupyterlite/pulls
[coc]: https://github.com/jupyter/governance/blob/main/docs/conduct/code_of_conduct.md
