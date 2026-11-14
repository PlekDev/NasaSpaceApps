PY ?= python
.PHONY: setup data pipeline validate figures all app test
setup:     ; $(PY) -m pip install -r requirements.txt
data:      ; $(PY) scripts/download_data.py
pipeline:  ; $(PY) scripts/run_pipeline.py
validate:  ; $(PY) scripts/validate_illumination.py
figures:   ; $(PY) scripts/make_figures.py
all: data pipeline validate figures
app:       ; streamlit run app/streamlit_app.py
test:      ; $(PY) -m pytest -q
