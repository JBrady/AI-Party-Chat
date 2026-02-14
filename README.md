# Voice Party Chat MVP (v1)

Text-mode backend for a multi-agent "party chat" MVP with a rule-based Director, strict Play Plan JSON schema validation, and a runtime scheduler.

## Run

```bash
npm install
npm run dev
```

Default port: `3001` (override with `PORT`).

## LLM setup

Set environment variables before running the server:

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_MODEL="gpt-4o-mini"
# Optional, defaults to https://api.openai.com/v1
export OPENAI_BASE_URL="https://api.openai.com/v1"
```

If `budget_mode` is `frugal`, the server uses the deterministic fallback generator instead of the LLM.

## Example request

```bash
curl -s -X POST http://localhost:3001/turn \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"user","text":"What is this room about?"}' | jq
```

## Example LLM voices

```bash
curl -s -X POST http://localhost:3001/turn \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"user","text":"Give me a quick take on why people argue online."}' \
  | jq -r '.transcript[] | "\(.speaker): \(.text)"'
```
