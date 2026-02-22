# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal academic website for Dongwon Kim (postdoctoral researcher at KAIST), built with Jekyll using the [al-folio](https://github.com/alshedivat/al-folio) theme. Deployed to GitHub Pages at https://kdwonn.github.io.

## Build & Development Commands

```bash
bundle install                                           # Install Ruby dependencies
bundle exec jekyll serve                                 # Local dev server at http://localhost:4000
JEKYLL_ENV=production bundle exec jekyll build --lsi     # Production build (outputs to _site/)
bin/cibuild                                              # CI build shortcut
docker-compose up                                        # Docker dev at http://localhost:8080
pre-commit run -a                                        # Run all linting hooks
```

**Local preview**: Use `eval "$(rbenv init - zsh)" && bundle exec jekyll serve` to preview changes locally at http://localhost:4000. The `--lsi` flag is not needed for local preview and may cause errors with few posts. The server supports auto-regeneration so file changes are picked up automatically on refresh.

## Architecture

**Content collections** defined in `_config.yml`:
- `_news/` — announcements shown on homepage (inline markdown, date-ordered)
- `_projects/` — portfolio items with category support and grid layout
- `_experiences/` — work/research experience timeline entries
- `_honors/` — awards and honors (inline display)
- `_education/` — education history entries
- `_pages/` — static pages (about, publications, CV)
- `_posts/` — blog posts (`YYYY-MM-DD-title.md` format)

**Publications** are auto-generated from `_bibliography/papers.bib` via the jekyll-scholar plugin. Author highlighting matches `Kim, Dongwon` (configured in `_config.yml` under `scholar:`). Co-author links are defined in `_data/coauthors.yml`. The `selected: true` BibTeX field controls which papers appear in the selected publications section.

**Templates**: `_layouts/` for page templates, `_includes/` for reusable components (header, footer, scripts), `_sass/` for SCSS styles built on Bootstrap 4.6.1.

**Custom plugins** in `_plugins/`: `details.rb` (collapsible sections), `external-posts.rb` (RSS integration), `hideCustomBibtex.rb` (BibTeX field filtering).

## Conventions

- Filenames: kebab-case; 2-space indentation for YAML/Markdown/HTML
- Front matter: minimal keys (`title`, `date`, `layout`, `inline`)
- Assets go under `assets/` with logical subfolders (img, pdf, css, js)
- Commit messages: short, imperative (e.g., "fix encoding", "update bib")
- Pre-commit hooks enforce: trailing whitespace, end-of-file newlines, YAML validity, no large files

## Key Configuration

- `_config.yml` — all site settings, collection definitions, plugin configs, library versions
- `_data/coauthors.yml` — maps author names to profile URLs for bibliography linking
- `_data/venues.yml` — venue abbreviation mappings for publications
- Dark mode is disabled (`enable_darkmode: false`)
- MathJax, medium zoom, masonry layout, and progress bar are enabled

## Deployment

Push to `master` triggers GitHub Actions (`.github/workflows/deploy.yml`) which builds with Ruby 3.2.2 and deploys to the `gh-pages` branch. Manual deploy available via `bin/deploy`.
