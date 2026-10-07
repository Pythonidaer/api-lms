# API Learning Studio

A standalone API LMS following **JSON → HTTP → API → GraphQL**, with short transport/format refreshers and a focused API learning path.

- **31 guided lessons / 189 slides**: API concepts, consumption, resource/data contracts, identity/security, OpenAPI, testing, reliable integrations and lifecycle management.
- **Eight module quizzes / 32 questions**, plus an independent **20-question final assessment**. Passing is 80%; retakes are enabled.
- Goals, original examples, practice and worked checks in every guided lesson.
- **37 selected licensed source documents**, adapted into an optional searchable reference collection; eight additional original reading guides link to Postman, Swagger, IETF, GraphQL and gRPC documentation.
- A real local Tasks API fixture, a complete OpenAPI description and a 14-request Postman collection.
- Browser-local progress, notes, completion/time records, learner reports/CSV, complete-course copying, responsive navigation and safe Markdown rendering.

The core path stays separate from the full [JSON](https://github.com/Pythonidaer/json-lms), [HTTP](https://github.com/Pythonidaer/http-lms) and [GraphQL](https://github.com/Pythonidaer/graphql-lms) courses. References start collapsed and never block core progression. All lessons are unlocked by default; learner settings can apply progression rules. Exercises are self-assessed and grades are study feedback; answers ship with the static reader.

## Why these sources work together

| Source | Role and exact packaged scope |
|---|---|
| [MDN](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Client-side_APIs/Introduction) | Eight API foundations/consumption documents: Introduction, Third-party APIs, Using Fetch, Request, Response, AbortController, WebSockets API and Using Server-Sent Events |
| [Microsoft API guidelines](https://github.com/microsoft/api-guidelines) | Full Azure REST API Guidelines, Considerations for Service Design and Versioning Guidelines; the root deprecated-guidelines notice is also preserved |
| [OpenAPI Initiative](https://spec.openapis.org/) / [Swagger](https://swagger.io/docs/specification/v3_0/about/) | Complete OpenAPI **3.1.2** and **3.2.1** specifications, divided into searchable chapter decks; Swagger tool overview is linked. The practice artifact uses **3.1.0**, with 3.1 feature semantics |
| [Postman](https://learning.postman.com/) | Linked current guides for response tests, variables and collection runs; original local collection/workflow examples, rather than republishing the proprietary documentation catalog |
| [OWASP API Security](https://owasp.org/API-Security/) | Complete **English 2023 edition**, all 23 Markdown documents including every Top 10 risk and supporting material |
| IETF and protocol maintainers | Original linked reading guides for Problem Details/OAuth security and GraphQL/gRPC; full external standards are not copied |

These sources cover different layers of API work. Microsoft/Azure conventions are labeled as organizational policy, not universal REST/HTTP rules. Swagger’s linked introductory guide uses 3.0, so its schema details should not be mixed blindly with the course’s 3.1 examples. Newer OpenAPI 3.2 chapters are optional; verify tool support before migrating.

**Coverage is explicit, not “every API page on every website.”** MDN’s thousands of browser interface pages, provider-specific API catalogs, all Postman product settings and every linked specification are outside this curated course. The complete selected source text is retained under `docs/sources/`, with commit/blob/checksum/version records in `source-manifest.json` and `docs/source-inventory.json`. Technical reference text is adapted for slides; source code examples remain verbatim. Images/Mermaid source diagrams and generated support tables link to original/live renderings or appear as inert source text. The pinned snapshot date is 2026-10-07.

The optional collection has **164 decks / 895 slides**, including chapter splits and eight external reading guides. Search covers titles and slide bodies, expands matching sections temporarily and opens a matching slide when you choose a result.

## Run the course and API exercises

No installation is needed to read the built static course. To run the synthetic API and serve the reader together, use Node 20 or newer:

```sh
node scripts/practice-server.cjs
```

Open **http://localhost:8000**. Stop with Ctrl+C. See [practice/README.md](practice/README.md) for curl workflows, fixture limits and expected outcomes. Import [practice/tasks.postman_collection.json](practice/tasks.postman_collection.json) into Postman, or run the dependency-free Node test suite. The full machine-readable API contract is [practice/openapi.json](practice/openapi.json).

The loopback-only fixture demonstrates caller-owned tasks, scoped writes, validated input, bounded pagination, Problem Details, creation/replay/conflict, ETag conditional reads/writes, cancellation, synthetic 429 and asynchronous operation resources. State is bounded and memory-only. Public demo token labels do not implement production identity; OAuth, live streaming, signed webhook delivery and durable deduplication remain conceptual design exercises.

The static reader can run on GitHub Pages or another static host. A hosted copy serves course files and downloadable practice artifacts; it **does not host the local Tasks API endpoints**. For local practice, use the Node server. No remote lesson code executes automatically, and no analytics or external scripts are required.

## Rebuild and check

Python 3.12 and the authoring/validation dependencies are needed only for maintenance; the built reader does not need them.

```sh
python3 -m pip install -r requirements-dev.txt
python3 scripts/fetch-sources.py
python3 scripts/build-course.py
python3 scripts/build-practice.py
node scripts/test-content.cjs
node scripts/test-api.cjs /tmp/api-responses.json
python3 scripts/validate-contract.py /tmp/api-responses.json
```

The fetcher downloads only pinned commits and verifies every Git blob SHA. The builders deterministically regenerate the course, embedded HTML data, statistics, source manifest and practice artifacts. Do not hand-edit the embedded course JSON. To update source coverage, deliberately update the inventory/pins together and review notices and licensing.

Browser checks require the optional Playwright development dependency and Chromium:

```sh
npm install
npx playwright install chromium
node scripts/test-browser.cjs
```

`CHROMIUM_PATH` selects an existing Chromium binary; `CHROMIUM_ARGS_MODULE` optionally loads launch arguments from a Chromium bundle module. `LMS_TEST_ARTIFACTS` saves test screenshots.

Validation checks source hashes/coverage, preservation of every fenced source example, source notices, runtime course validity, unique IDs, embedded parity, slide limits/fences, topic mappings, all fixture behavior and Postman assertions, valid OpenAPI/reference/schema structure and live responses against the declared contract. Browser checks cover 390/768/1440 widths, mobile menu, full-text search/collapse, every rendered slide, unsafe HTML/URLs, optional progression, final scoring/persistence, reports/CSV, notes and complete-course copying. GitHub Actions also verifies deterministic rebuilds.

## Attribution and licensing

Original guided text/exercises and reading-guide text: **CC BY 4.0**, attributed to this project. Reference adaptations retain their per-source licenses and contributor attribution on every reference deck and in the manifest:

- MDN contributors: **CC BY-SA 2.5** text; upstream code licensing as described in [docs/sources/mdn/LICENSE.md](docs/sources/mdn/LICENSE.md).
- Microsoft contributors: **CC BY 4.0**, [license notice](docs/sources/microsoft/license.txt).
- OpenAPI Initiative / Linux Foundation contributors: **Apache-2.0**, [license](docs/sources/oai/LICENSE).
- OWASP API Security Project contributors: **CC BY-SA 4.0**, [license](docs/sources/owasp/LICENSE).
- Vendored Marked: **MIT**, [notice](vendor/marked.LICENSE.md).

Upstream licenses apply to their individual source/adapted reference material; original course text is a separate contribution. Third-party linked pages are not relicensed or republished. Classroom fixture/test/authoring code added by this project is MIT under [LICENSE](LICENSE).
