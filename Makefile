PY ?= python
.PHONY: web web-dev web-test web-e2e setup data pipeline validate figures extras far imagery eonet lst-submit lst all app test
setup:     ; $(PY) -m pip install -r requirements.txt
data:      ; $(PY) scripts/download_data.py
pipeline:  ; $(PY) scripts/run_pipeline.py
validate:  ; $(PY) scripts/validate_illumination.py
figures:   ; $(PY) scripts/make_figures.py
extras:    ; $(PY) scripts/make_thumbnails.py && $(PY) scripts/validate_known_analogs.py && $(PY) scripts/sensitivity.py && $(PY) scripts/diviner_context.py && $(PY) scripts/mars_context.py && $(PY) scripts/thermal_gap.py
lst-submit: ; $(PY) scripts/earth_lst.py submit
lst:       ; $(PY) scripts/earth_lst.py download && $(PY) scripts/earth_lst.py compute
far:       ; $(PY) scripts/validate_far_horizons.py
imagery:   ; $(PY) scripts/real_imagery.py fetch
eonet:     ; $(PY) scripts/eonet_snapshot.py
all: data pipeline validate figures extras far imagery eonet
app:       ; streamlit run app/streamlit_app.py
test:      ; $(PY) -m pytest -q
web:       ; $(PY) -I web/tools/export_data.py && cd web && npm ci && npm run build
web-dev:   ; $(PY) -I web/tools/export_data.py && cd web && npm install && npm run dev
web-test:  ; $(PY) -m pytest -q web/tests && cd web && npm test
web-e2e:   ; cd web && npm ci && BASE_PATH=/NasaSpaceApps/ npm run build && ($(PY) tools/serve_dist.py /NasaSpaceApps 8099 & echo $$! > /tmp/pen-serve.pid; sleep 1; for b in chromium firefox webkit; do BROWSER=$$b BASE=http://127.0.0.1:8099/NasaSpaceApps $(PY) tests/e2e.py || true; done; BASE=http://127.0.0.1:8099/NasaSpaceApps $(PY) tools/axe_run.py; $(PY) tools/perf.py http://127.0.0.1:8099/NasaSpaceApps/; kill `cat /tmp/pen-serve.pid`)
