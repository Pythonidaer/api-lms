# API LMS maintainer handoff

Read README.md, practice/README.md and source-manifest.json. This repository keeps the existing Learning Studio runtime/interface and adds a focused API path. The separate JSON/HTTP/GraphQL LMS repositories own those full courses.

Edit scripts/curriculum.py for original guided content. scripts/build-course.py builds course.json, its embedded index.html copy, course-stats.json and source-manifest.json from the curriculum and pinned licensed sources. scripts/build-practice.py builds practice/openapi.json and the Postman collection. Never update one course copy alone.

Source coverage is the explicitly selected 37 licensed documents plus eight linked original reading guides, not every API document on those sites. Preserve licenses, source pins, notices, original code examples and the scope distinctions. Microsoft/Azure is a design convention source; the root deprecated notice remains labeled. Core examples use OpenAPI 3.1; the complete 3.2.1 source is optional extension reading.

Runtime schema must preserve optional on reference decks and collapsed on sections. References never block required progression. Search expands matches temporarily, restores saved collapse states on clear and selects the first matching slide. Source HTML and unsafe URL schemes remain inert. Progress/notes/reporting are browser-local and quiz answers are client-visible.

The synthetic Tasks API is loopback-only, bounded and in-memory. Demo bearer labels are not production authentication. Ensure authorization before state changes, input/output field control, atomic stale-validator checks after asynchronous body reading and caller-scoped deduplication. The static hosted course does not host the API endpoints.

Run content, fixture, OpenAPI/live-response and browser suites after relevant changes; GitHub Actions checks deterministic rebuilds too. Browser tests cover every rendered slide as well as responsive navigation, persistence, search, progression, assessment/reporting and copying. Inspect screenshots after visual changes.
