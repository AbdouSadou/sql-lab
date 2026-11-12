SQLITE_YEAR := 2026
SQLITE_VERSION := 3540100
SQLITE_URL := https://sqlite.org/$(SQLITE_YEAR)/sqlite-wasm-$(SQLITE_VERSION).zip
VENDOR_DIR := vendor
PORT ?= 8000

.PHONY: sqlite serve

# Refresh the vendored SQLite WASM build (vendor/sqlite3.js + vendor/sqlite3.wasm).
# To bump the engine: edit SQLITE_YEAR and SQLITE_VERSION above, run
# `make sqlite`, then commit the two files in vendor/.
sqlite:
	mkdir -p $(VENDOR_DIR)
	tmp=$$(mktemp -d) && \
	curl -fsSL -o $$tmp/sqlite-wasm.zip $(SQLITE_URL) && \
	unzip -joq $$tmp/sqlite-wasm.zip '*/jswasm/sqlite3.js' '*/jswasm/sqlite3.wasm' -d $(VENDOR_DIR) && \
	rm -f $$tmp/sqlite-wasm.zip && rmdir $$tmp

# Local dev server. Nothing is built to serve the site, but the app's page runs the
# committed bundle/: after editing js/ or css/, run npm run build:app (README, The app bundle).
serve:
	python3 -m http.server $(PORT)
