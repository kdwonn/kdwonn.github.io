# Repository Guidelines

## Project Structure & Module Organization
- Source: Jekyll site using the al-folio theme. Key dirs:
  - `_pages/` static pages, `_posts/` blog posts (`YYYY-MM-DD-title.md`).
  - `_projects/`, `_news/`, `_experiences/`, `_honors/` content collections.
  - `_layouts/`, `_includes/`, `_sass/` theme templates and styles.
  - `_data/` YAML config (e.g., `coauthors.yml`, `cv.yml`).
  - `_bibliography/papers.bib` references for jekyll-scholar.
  - `assets/` images, css, js; `_config.yml` site configuration.

## Build, Test, and Development Commands
- Standard: `bundle install` then `bundle exec jekyll serve --lsi` (local dev at `http://localhost:4000`).
- Production build: `JEKYLL_ENV=production bundle exec jekyll build --lsi` (outputs to `_site/`).
- Docker (prebuilt image): `docker-compose up` (serves on `http://localhost:8080`).
- Docker (local image): `docker-compose -f docker-local.yml up`.
- Quick CI-like build: `bin/cibuild` (runs a Jekyll build).

## Coding Style & Naming Conventions
- Markdown/HTML/YAML with 2-space indentation; wrap lines reasonably (<100 cols).
- Filenames: kebab-case; posts follow `YYYY-MM-DD-title.md`.
- Front matter: minimal, consistent keys (e.g., `title`, `date`, `categories`, `tags`, `layout`).
- Assets: place under `assets/` with logical subfolders; reference via relative URLs.
- Linting: `pre-commit` hooks enabled (`trailing-whitespace`, `end-of-file-fixer`, `check-yaml`). Run `pre-commit run -a` before commits.

## Testing Guidelines
- Ensure `bundle exec jekyll build --lsi` completes without warnings/errors.
- Validate YAML front matter and `_data/*.yml` (hooks will check).
- Manually verify key pages render and links/images resolve locally.
- For bibliography changes, confirm citations render from `_bibliography/papers.bib`.

## Commit & Pull Request Guidelines
- Messages are short, imperative, and scoped (examples from history: `fix encoding`, `update bib`, `add internship`).
- Branch from `master` for changes; keep PRs focused and small.
- PRs should include: concise description, linked issue (if any), screenshots for visual changes, and steps to reproduce/build (`bundle exec jekyll serve` or `docker-compose up`).
- Do not commit secrets; site URLs and `baseurl` live in `_config.yml`.

## Configuration Tips
- Set `url` and `baseurl` correctly before deploy; use `JEKYLL_ENV=production` for minified assets.
- Use `bin/deploy` for manual GitHub Pages deployment to `gh-pages` (reads current commit message).
