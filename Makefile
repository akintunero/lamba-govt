COMPOSE := docker compose -f docker-compose.lite.yml

.PHONY: up build down logs reset validate test

up:
	$(COMPOSE) up -d

build:
	$(COMPOSE) up --build -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

reset:
	$(COMPOSE) down -v
	@echo "Reset complete. Run 'make build' then 'make up'."

test:
	bash scripts/e2e-ctf-test.sh

validate:
	node scripts/validate-openapi.js
	node scripts/validate-identity-config.js
	node scripts/validate-search-mappings.js
	node scripts/validate-legacy-service.js
	node scripts/validate-event-schemas.js
