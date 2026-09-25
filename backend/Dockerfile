# syntax=docker/dockerfile:1.7
FROM python:3.13-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml requirements.lock README.md THIRD_PARTY_NOTICES.md ./
COPY src ./src
COPY migrations ./migrations
COPY config ./config

ARG INSTALL_ALL_CONNECTORS=false
RUN if [ "$INSTALL_ALL_CONNECTORS" = "true" ]; then \
      pip install --no-cache-dir --constraint requirements.lock ".[all-connectors]"; \
    else \
      pip install --no-cache-dir --constraint requirements.lock .; \
    fi

FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY --from=builder /usr/local /usr/local

RUN useradd --create-home --uid 10001 applyit
USER applyit

ENTRYPOINT ["applyit-ingestion"]
CMD ["serve"]
