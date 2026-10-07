const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{createPracticeServer}=require('./practice-server.cjs');
(async()=>{
 const server=createPracticeServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
 try{
  const opts={headless:true};if(process.env.CHROMIUM_PATH){opts.executablePath=process.env.CHROMIUM_PATH;if(process.env.CHROMIUM_ARGS_MODULE)opts.args=(await import(process.env.CHROMIUM_ARGS_MODULE)).default.args;}
  browser=await chromium.launch(opts);const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:950});await page.goto(base);await page.waitForSelector('#lms-heading');assert.equal(await page.locator('#lms-heading').textContent(),'Goal and reading');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(width===390){await page.locator('.lms-menu-button').click();assert.equal(await page.locator('#lms-nav').getAttribute('aria-hidden'),'false');await page.keyboard.press('Escape');assert.equal(await page.locator('#lms-nav').getAttribute('aria-hidden'),'true');await page.locator('[data-lms="outline"]').click();}
   if(await page.locator('#lms-outline').isHidden())await page.locator('[data-lms="outline"]').click();
   assert.equal(await page.locator('[data-lms-section="reference-library"]').getAttribute('open'),null);
   await page.locator('#lms-search').fill('Security Requirement Object');assert.ok((await page.locator('.lms-search-status').textContent()).includes('matching'));assert.equal(await page.locator('[data-lms-section="reference-library"]').getAttribute('open'),'');
   await page.locator('#lms-search').fill('zzNoMatch0123');assert.equal(await page.locator('.lms-search-status').textContent(),'No matching lessons');await page.locator('#lms-search').fill('');assert.equal(await page.locator('[data-lms-section="reference-library"]').getAttribute('open'),null);
   if(width===390)await page.locator('[data-lms="outline"]').click();
   if(process.env.LMS_TEST_ARTIFACTS){fs.mkdirSync(process.env.LMS_TEST_ARTIFACTS,{recursive:true});await page.screenshot({path:path.join(process.env.LMS_TEST_ARTIFACTS,`api-${width}.png`),fullPage:true});}
  }
  // An open reference navigates to the matching slide, rather than its intro.
  await page.locator('#lms-search').fill('oneOf');const raw=JSON.parse(fs.readFileSync('course.json'));function flat(nodes){return nodes.flatMap(n=>n.type==='section'?flat(n.children):[n]);}const reference=flat(raw.sections).find(n=>n.optional&&n.slides.some((s,i)=>i>0&&s.body.includes('oneOf')));await page.locator(`[data-id="${reference.id}"]`).click();assert.ok((await page.locator('.lms-prose').textContent()).toLowerCase().includes('oneof'));await page.locator('#lms-search').fill('');
  // Rendering the complete collection must keep scripts/URLs inert.
  const rendered=await page.evaluate(()=>{const lessons=LMS.flatten(LMS.validate(JSON.parse(document.querySelector('#lms-course-data').textContent)).sections);let slides=0,codes=0,tables=0;for(const n of lessons)for(const s of n.slides||[]){const d=document.createElement('div');d.innerHTML=LMSMarkdown(s.body);if(d.querySelector('script,iframe,[onerror],[onclick],a[href^="javascript:"]'))throw Error('Unsafe source rendering');slides++;codes+=d.querySelectorAll('pre').length;tables+=d.querySelectorAll('table').length;}return{slides,codes,tables};});assert.equal(rendered.slides,1084);assert.ok(rendered.codes>300);assert.ok(rendered.tables>50);
  const unsafe=await page.evaluate(()=>{const d=document.createElement('div');d.innerHTML=LMSMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>');return d.querySelector('script,[onerror],a[href^="javascript:"]')!==null;});assert.equal(unsafe,false);
  await page.addInitScript(()=>{const seed=localStorage.getItem('api-test-progress-seed');if(seed){const item=JSON.parse(seed);localStorage.setItem(item.key,JSON.stringify(item.value));localStorage.removeItem('api-test-progress-seed');}});
  await page.evaluate(()=>{const raw=JSON.parse(document.querySelector('#lms-course-data').textContent);localStorage.setItem('api-test-progress-seed',JSON.stringify({key:'design-lab-lms-progress-'+raw.id,value:{records:{},unlockAll:false}}));});
  await page.reload();assert.equal(await page.locator('[data-id="api-final"]').isEnabled(),false);assert.equal(await page.locator(`[data-id="${reference.id}"]`).isEnabled(),true);
  await page.evaluate(()=>{const raw=JSON.parse(document.querySelector('#lms-course-data').textContent),course=LMS.validate(raw),records={};for(const n of LMS.flatten(course.sections)){if(n.optional)continue;let hash=0;for(const ch of JSON.stringify(n))hash=(Math.imul(31,hash)+ch.charCodeAt(0))|0;records[n.id]={fingerprint:String(hash),completed:true,seconds:0,slideSeen:[],attempts:[]};}localStorage.setItem('api-test-progress-seed',JSON.stringify({key:'design-lab-lms-progress-'+course.id,value:{records,unlockAll:false}}));});
  await page.reload();await page.locator('[data-id="api-final"]').click();assert.equal(await page.locator('#lms-heading').textContent(),'Final assessment — API skills');
  for(const q of raw.finalQuiz.questions)await page.locator(`input[name="q-${q.id}"][value="${q.answer}"]`).check();await page.locator('#lms-quiz button[type="submit"]').click();assert.ok((await page.locator('.lms-result').last().textContent()).includes('100%'));await page.reload();assert.ok((await page.locator('.lms-result').first().textContent()).includes('100%'));
  await page.locator('[aria-label="Reports"]').click();assert.ok((await page.locator('main').textContent()).includes('100'));
  const csvPromise=page.waitForEvent('download');await page.locator('[data-lms="csv"]').click();const download=await csvPromise;assert.ok(download.suggestedFilename().endsWith('.csv'));
  await page.locator('.lms-home').click();await page.locator('[data-lms-notes]').fill('Capstone notes: contract and boundary evidence.');await page.reload();assert.equal(await page.locator('[data-lms-notes]').inputValue(),'Capstone notes: contract and boundary evidence.');
  // Capture the whole-course clipboard text and prove collapsed references/answers
  // are included, not merely the current slide.
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async writeText(text){window.copiedCourse=text;}}}));await page.locator('[data-lms="copy-course"]').click();await page.waitForFunction(()=>window.copiedCourse?.includes('Final assessment — API skills'));const text=await page.evaluate(()=>window.copiedCourse);assert.ok(text.includes('API1:2023 Broken Object Level Authorization'));assert.ok(text.includes('Correct answer:'));assert.ok(text.includes('OpenAPI Specification 3.2.1'));
  assert.deepEqual(errors,[]);console.log(`Browser passed: responsive widths/mobile menu, search/matching slide, ${rendered.slides} rendered slides (${rendered.codes} code blocks/${rendered.tables} tables), optional reference gating, final score/report/CSV, persistence and complete course copying.`);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
