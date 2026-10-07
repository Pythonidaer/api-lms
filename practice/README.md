# Tasks API practice

Start from the repository root:

```sh
node scripts/practice-server.cjs
```

Open http://localhost:8000 for the LMS. The API lives at http://localhost:8000/api/v1. Stop with Ctrl+C; restart resets all tasks, operations and idempotency records. The server binds only to loopback and stores bounded synthetic state in memory.

Use the public teaching labels `demo-alice`, `demo-bob` or `demo-readonly` as bearer credentials. They are fixed mappings with **no production authentication, OAuth or JWT validation**. Alice owns `t1`, `t2`, `t3`; Bob owns `t4`. Readonly has Alice’s read access but no write scope. Output representations omit the internal owner field. Objects outside the caller’s visibility return 404.

## Work one complete integration

```sh
# An unauthenticated call returns 401 Problem Details.
curl -i http://localhost:8000/api/v1/tasks

# List Alice’s tasks. Follow the returned cursor with the same filter.
curl -i -H 'Authorization: Bearer demo-alice' \
  'http://localhost:8000/api/v1/tasks?limit=1'

# Create once; repeat exactly this request to see a replay of the same ID.
curl -i -X POST http://localhost:8000/api/v1/tasks \
  -H 'Authorization: Bearer demo-alice' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: capstone-create-1' \
  --data '{"title":"Review the contract"}'

# On a fresh fixture the created task is t5. Use the actual Location if you
# already created other tasks. Read its ETag before a conditional write.
curl -i -H 'Authorization: Bearer demo-alice' \
  http://localhost:8000/api/v1/tasks/t5

curl -i -X PATCH http://localhost:8000/api/v1/tasks/t5 \
  -H 'Authorization: Bearer demo-alice' \
  -H 'Content-Type: application/json' \
  -H 'If-Match: "t5-v1"' \
  --data '{"status":"done"}'

# Repeating the stale validator returns 412 and preserves the newer state.
# Test the access boundaries and field allowlist as well.
curl -i -H 'Authorization: Bearer demo-alice' \
  http://localhost:8000/api/v1/tasks/t4

curl -i -X POST http://localhost:8000/api/v1/tasks \
  -H 'Authorization: Bearer demo-readonly' \
  -H 'Content-Type: application/json' --data '{"title":"Denied write"}'

# A completed DELETE returns 204; a subsequent read returns 404.
curl -i -X DELETE -H 'Authorization: Bearer demo-alice' \
  http://localhost:8000/api/v1/tasks/t5

# Accepted work is not yet a completed result. Follow Location with a budget.
curl -i -X POST http://localhost:8000/api/v1/exports \
  -H 'Authorization: Bearer demo-alice' \
  -H 'Content-Type: application/json' --data '{}'

curl -i -H 'Authorization: Bearer demo-alice' \
  http://localhost:8000/api/v1/operations/op1
```

Every API call returns a safe `X-Request-Id`. Error responses use `application/problem+json`, with stable category `type`, human `title`/`detail`, HTTP-aligned `status` and request `instance`. Unknown methods return 405 with Allow. There is no cross-origin configuration; use the same practice origin.

| Operation | Contract |
|---|---|
| `GET /health` | Public fixture check |
| `GET /tasks` | Owned collection, limit 1–3, optional open/done filter and opaque nextCursor |
| `POST /tasks` | Title-only creation → 201/Location; optional caller-scoped Idempotency-Key |
| `GET /tasks/{id}` | Owned representation + ETag; exact If-None-Match → bodyless 304 |
| `PATCH /tasks/{id}` | JSON partial title/status update; exact If-Match required (428 missing, 412 stale) |
| `DELETE /tasks/{id}` | Remove a visible task → bodyless 204 |
| `POST /exports` | Empty JSON object → 202/Location/Retry-After; synthetic work |
| `GET /operations/{id}` | Owned running/succeeded state; count computed at polling time |
| `GET /demo/rate-limit` | Always synthetic 429/Retry-After: 1 |
| `GET /demo/slow` | Approximately 750 ms delay for cancellation practice |

Idempotency deduplicates the same caller/key/trimmed-title combination for up to ten minutes while a bounded 256-record cache retains it; changed input returns 409. Restart clears the cache; deleting a task does not erase its cached creation outcome. This is an explicit fixture rule, not a universal HTTP guarantee. Creation is capped at 256 live tasks; operations at 64. Cursors are inspectable encoding, not cryptographically protected credentials. The fixture rechecks ownership every request and does not promise snapshot isolation.

PATCH is a defined JSON partial-update contract, **not JSON Patch or JSON Merge Patch**. The fixture accepts one exact validator, rather than the complete generic conditional-header grammar. Titles contain at least one non-whitespace character and at most 120 Unicode code points; write bodies are capped at 16,384 bytes. Unknown writable fields are rejected.

`openapi.json` is the complete description of the implemented API surface using OpenAPI 3.1.0. The core/reference explains the 3.1 feature set; 3.2.1 reading is optional. Validate the description with `scripts/validate-contract.py` and recorded responses from `scripts/test-api.cjs`.

Import `tasks.postman_collection.json` into Postman and run its 14 requests **in order on a fresh server**. It configures baseUrl/token and stores createdId/originalEtag for dependent calls. Real secrets do not belong in collection exports. The shipped Node suite also executes every original collection assertion against a separate fresh server, alongside a broader behavioral test matrix.

Exercises involving OAuth, signed webhook delivery, durable deduplication or live streaming are conceptual. The fixture implements none of those production systems. The static reader does not execute lesson code. A GitHub Pages deployment serves the course files; it does not host these API endpoints.
