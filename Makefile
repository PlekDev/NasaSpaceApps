PY ?= python
.PHONY: setup data pipeline validate figures extras far imagery eonet lst-submit lst all app test
setup:     ; $(PY) -m pip install -r requirements.txt
data:      ; $(PY) scripts/download_data.py
pipeline:  ; $(PY) scripts/run_pipeline.py
validate:  ; $(PY) scripts/validate_illumination.py
figures:   ; $(PY) scripts/make_figures.py
extras:    ; $(PY) scripts/make_thumbnails.py && $(PY) scripts/validate_known_analogs.py && $(PY) scripts/sensitivity.py && $(PY) scripts/diviner_context.py
lst-submit: ; $(PY) scripts/earth_lst.py submit
lst:       ; $(PY) scripts/earth_lst.py download && $(PY) scripts/earth_lst.py compute
far:       ; $(PY) scripts/validate_far_horizons.py
imagery:   ; $(PY) scripts/real_imagery.py fetch
eonet:     ; $(PY) scripts/eonet_snapshot.py
all: data pipeline validate figures extras far imagery eonet
app:       ; streamlit run app/streamlit_app.py
test:      ; $(PY) -m pytest -q
