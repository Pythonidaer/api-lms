# Design foundations

**Live site:** https://pythonidaer.github.io/api-lms/ (deployed with GitHub Pages from the root of `main`)

Run `python3 -m http.server 8000` in this folder and open http://localhost:8000. You can deploy this directory to any static host. No install/build step is needed. Direct remote media URLs require connectivity and permission to load. Uploaded media is packaged in assets/.

Edit course.json and copy its JSON into the lms-course-data script in index.html, or re-export from Design Lab. The embedded JSON lets the course load without a data API. Keep IDs stable to preserve progress; changing a lesson invalidates progress for that lesson.

Reports and learner settings are browser-local. No authentication, server, cloud dashboard, SCORM/xAPI integration or verified grading is included. Correct answers are in the client. Clearing browser data clears progress. Quiz attempts are not exam-secure.
