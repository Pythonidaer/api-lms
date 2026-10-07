const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const course=JSON.parse(fs.readFileSync('course.json')),manifest=JSON.parse(fs.readFileSync('source-manifest.json')),inventory=JSON.parse(fs.readFileSync('docs/source-inventory.json'));
const context=vm.createContext({crypto});vm.runInContext(fs.readFileSync('lms-runtime.js','utf8')+';globalThis.courseAPI=LMS;',context);const valid=context.courseAPI.validate(course);assert.equal(context.courseAPI.ready(valid).length,0);
const lessons=context.courseAPI.flatten(valid.sections),ids=new Set(lessons.map(n=>n.id)),refs=lessons.filter(n=>n.optional),core=lessons.filter(n=>!n.optional),stats=JSON.parse(fs.readFileSync('course-stats.json'));
assert.equal(manifest.sources.length,37);assert.equal(manifest.sources.length,inventory.filter(i=>!i.isLicense).length);assert.equal(refs.length,stats.referenceDecks);assert.equal(core.filter(n=>n.type==='slides').length,31);
for(const source of inventory){const bytes=fs.readFileSync(source.localPath);assert.equal(crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])).digest('hex'),source.sha,source.path);}
for(const source of manifest.sources){assert.ok(source.lessonIds.length);for(const id of source.lessonIds){assert.ok(ids.has(id));assert.ok(lessons.find(n=>n.id===id).optional);}
 const original=fs.readFileSync(source.localPath,'utf8'),adapted=source.lessonIds.map(id=>lessons.find(n=>n.id===id).slides.map(s=>s.body).join('\n')).join('\n');
 // Every fenced source example remains verbatim inert code (language attributes
 // may change). This catches accidentally stripping HTML or rewriting examples.
 for(const m of original.matchAll(/^```[^\n]*\n(.*?)^```\s*$/gms)){const snippet=m[1].trim();assert.ok(adapted.includes(snippet),`${source.path}: source code lost`);}
 assert.ok(adapted.includes(source.license));assert.ok(adapted.includes(source.commit));
}
assert.equal(manifest.sources.filter(s=>s.repository==='mdn/content').length,8);
assert.equal(manifest.sources.filter(s=>s.repository==='OWASP/API-Security'&&/0xa[1-9a]-/.test(s.path)).length,10);
assert.deepEqual(manifest.sources.filter(s=>s.repository==='OAI/OpenAPI-Specification').map(s=>s.path),['versions/3.1.2.md','versions/3.2.1.md']);
const embedded=fs.readFileSync('index.html','utf8').match(/<script id="lms-course-data" type="application\/json">(.*?)<\/script>/s)[1];assert.deepEqual(JSON.parse(embedded),course);
for(const n of lessons)for(const s of n.slides||[]){assert.ok(s.body.length<=20000,`${n.title} oversized`);assert.equal((s.body.match(/^```/gm)||[]).length%2,0,`${n.title}: ${s.title} unbalanced code`);assert.ok(!/HTTP_CODE_TOKEN_|\{\{\s*\w+\(/.test(s.body),`${n.title} unconverted markup`);}
for(const [,lessonIds]of manifest.topics)for(const id of lessonIds)assert.ok(ids.has(id),id);
assert.equal(course.finalQuiz.questions.length,20);assert.ok(course.sections.at(-1).collapsed);assert.ok(lessons.filter(n=>n.type==='quiz').every(n=>n.questions.length===4));
const contract=JSON.parse(fs.readFileSync('practice/openapi.json')),collection=JSON.parse(fs.readFileSync('practice/tasks.postman_collection.json'));assert.equal(contract.openapi,'3.1.0');assert.equal(collection.item.length,14);
console.log('Content passed: 41 checksum-verified files, all 37 selected documents, original code examples, source notices, core/topic mapping, embedded parity, limits/fences and valid quiz models.');
