# Voice Party Chat MVP (v1)

Text-mode backend for a multi-agent "party chat" MVP with a rule-based Director, strict Play Plan JSON schema validation, and a runtime scheduler.

## Run

```bash
npm install
npm run dev
```

## Example request

```bash
curl -s -X POST http://localhost:3000/turn \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"user","text":"What is this room about?"}' | jq
```
