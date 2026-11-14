# Contributing (team workflow)

1. `git checkout main && git pull`, then `git checkout -b <yourname>/<short-topic>` (e.g. `ddona/svalbard-tiles`).
2. Make small commits. Before pushing, run `make test`. If you touched the app, run `streamlit run app/streamlit_app.py`.
3. `git push -u origin <branch>` → open a PR → 1 review (pairs in `docs/TEAM.md`) → **squash-merge**.
4. Data: put big files in `data/raw/` (git-ignored). Only Victor commits regenerated `data/processed/` and `figures/`,
   to avoid merge conflicts.
5. Add a new site: edit `config/sites.yaml`, then run `python scripts/download_data.py <site_id>`.
6. Add a new feature dimension: compute it per window in `pen/features.py` and register its keys in `DIMENSIONS`.
   Scoring, the app sliders and the cards pick it up automatically.
7. Public text (code comments, README, app, PRs) is in English. If you used AI help, say so in the PR.
