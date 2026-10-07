const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createPracticeServer}=require('./practice-server.cjs');
(async()=>{
 const server=createPracticeServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,base=origin+'/api/v1',records=[];
 const call=async(route,{method='GET',token='demo-alice',body,raw,headers={},expected}={})=>{
  const response=await fetch(base+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined||raw!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:raw!==undefined?raw:body!==undefined?JSON.stringify(body):undefined});
  const text=await response.text(),value=text?JSON.parse(text):null,result={method,path:route,status:response.status,headers:Object.fromEntries(response.headers),body:value};records.push(result);if(expected!==undefined)assert.equal(response.status,expected,`${method} ${route}`);
  if(value?.type){assert.equal(value.status,response.status);assert.equal(result.headers['content-type'],'application/problem+json');assert.ok(!JSON.stringify(value).includes('stack'));}
  assert.ok(result.headers['x-request-id']);return result;
 };
 try{
  await call('/health',{token:null,expected:200});await call('/tasks',{token:null,expected:401});await call('/tasks',{token:'bad-token',expected:401});
  const page=await call('/tasks?limit=1',{expected:200});assert.equal(page.body.items.length,1);assert.ok(!Object.hasOwn(page.body.items[0],'owner'));assert.ok(page.body.nextCursor);
  const ids=[page.body.items[0].id];let cursor=page.body.nextCursor;while(cursor){const next=await call('/tasks?limit=1&cursor='+encodeURIComponent(cursor),{expected:200});ids.push(...next.body.items.map(t=>t.id));cursor=next.body.nextCursor;}assert.deepEqual(ids,['t1','t2','t3']);
  await call('/tasks?limit=1&status=done&cursor='+encodeURIComponent(page.body.nextCursor),{expected:400});await call('/tasks?cursor=garbage',{expected:400});
  for(const query of ['limit=0','limit=4','limit=1.0','status=','status=other','limit=1&limit=2','unknown=1'])await call('/tasks?'+query,{expected:400});
  await call('/tasks/t4',{expected:404});await call('/tasks/t1',{token:'demo-bob',expected:404});await call('/tasks/t1',{method:'DELETE',token:'demo-bob',expected:404});
  await call('/tasks',{token:'demo-readonly',expected:200});await call('/tasks',{method:'POST',token:'demo-readonly',body:{title:'No write'},expected:403});
  for(const body of [{},{title:null},{title:' '},{title:'x'.repeat(121)},{title:'Valid',owner:'bob'},[],{title:'Valid',__proto__:null,extra:1}])await call('/tasks',{method:'POST',body,expected:422});
  await call('/tasks',{method:'POST',raw:'{',expected:400});await call('/tasks',{method:'POST',raw:'{}',headers:{'Content-Type':'text/plain'},expected:415});await call('/tasks',{method:'POST',raw:' '.repeat(16385),expected:413});
  const unicode=await call('/tasks',{method:'POST',body:{title:'😀'.repeat(120)},expected:201});assert.equal([...unicode.body.title].length,120);
  const created=await call('/tasks',{method:'POST',body:{title:'  Contract practice  '},headers:{'Idempotency-Key':'exercise-key'},expected:201}),id=created.body.id;assert.equal(created.body.title,'Contract practice');assert.equal(created.headers.location,'/api/v1/tasks/'+id);
  const replay=await call('/tasks',{method:'POST',body:{title:'Contract practice'},headers:{'Idempotency-Key':'exercise-key'},expected:201});assert.equal(replay.body.id,id);assert.equal(replay.headers['idempotent-replay'],'true');
  await call('/tasks',{method:'POST',body:{title:'Another'},headers:{'Idempotency-Key':'exercise-key'},expected:409});
  const otherCaller=await call('/tasks',{method:'POST',token:'demo-bob',body:{title:'Another'},headers:{'Idempotency-Key':'exercise-key'},expected:201});assert.notEqual(otherCaller.body.id,id);
  const read=await call('/tasks/'+id,{expected:200}),etag=read.headers.etag;const cached=await call('/tasks/'+id,{headers:{'If-None-Match':etag},expected:304});assert.equal(cached.body,null);
  await call('/tasks/'+id,{method:'PATCH',body:{status:'done'},expected:428});
  const updated=await call('/tasks/'+id,{method:'PATCH',body:{status:'done'},headers:{'If-Match':etag},expected:200});assert.equal(updated.body.version,2);assert.equal(updated.body.status,'done');assert.notEqual(updated.headers.etag,etag);
  await call('/tasks/'+id,{method:'PATCH',body:{title:'Overwrite'},headers:{'If-Match':etag},expected:412});
  await call('/tasks/'+id,{method:'PATCH',body:{owner:'bob'},headers:{'If-Match':updated.headers.etag},expected:422});assert.equal((await call('/tasks/'+id)).body.title,'Contract practice');
  const current=await call('/tasks/t1');const races=await Promise.all([call('/tasks/t1',{method:'PATCH',body:{title:'Concurrent A'},headers:{'If-Match':current.headers.etag}}),call('/tasks/t1',{method:'PATCH',body:{title:'Concurrent B'},headers:{'If-Match':current.headers.etag}})]);assert.deepEqual(races.map(r=>r.status).sort(),[200,412]);
  const limit=await call('/demo/rate-limit',{expected:429});assert.equal(limit.headers['retry-after'],'1');
  await assert.rejects(fetch(base+'/demo/slow',{headers:{Authorization:'Bearer demo-alice'},signal:AbortSignal.timeout(50)}));await call('/demo/slow',{expected:200});
  const accepted=await call('/exports',{method:'POST',body:{},expected:202}),opPath=accepted.headers.location.replace('/api/v1','');assert.equal(accepted.body.state,'running');await call(opPath,{token:'demo-bob',expected:404});
  let operation;for(let attempt=0;attempt<20;attempt++){operation=await call(opPath,{expected:200});if(operation.body.state==='succeeded')break;await new Promise(r=>setTimeout(r,30));}assert.equal(operation.body.state,'succeeded');assert.ok(operation.body.result.taskCount>=4);
  await call('/tasks/'+id,{method:'DELETE',expected:204});await call('/tasks/'+id,{expected:404});
  const unsupported=await call('/tasks',{method:'PUT',body:{title:'No'},expected:405});assert.equal(unsupported.headers.allow,'GET, POST');
  // Run every shipped Postman request and original assertion against a clean fixture.
  const clean=createPracticeServer();await new Promise(r=>clean.listen(0,'127.0.0.1',r));const collection=JSON.parse(fs.readFileSync('practice/tasks.postman_collection.json')),variables=new Map(collection.variable.map(v=>[v.key,v.value]));variables.set('baseUrl',`http://127.0.0.1:${clean.address().port}/api/v1`);
  const replace=s=>s.replace(/\{\{([^}]+)\}\}/g,(_,key)=>{assert.ok(variables.has(key),key);return variables.get(key);});
  try{for(const item of collection.item){const req=item.request,headers=Object.fromEntries(req.header.map(h=>[h.key,replace(h.value)]));if(req.auth?.type!=='noauth')headers.Authorization='Bearer '+variables.get('token');const response=await fetch(replace(req.url),{method:req.method,headers,body:req.body?replace(req.body.raw):undefined}),text=await response.text();
    function expect(actual){const chain={get to(){return chain},get have(){return chain},get not(){chain.negated=true;return chain},eql(wanted){assert.deepEqual(actual,wanted);},include(wanted){assert.ok(actual.includes(wanted));},lengthOf(n){assert.equal(actual.length,n);},property(name){assert.equal(Object.hasOwn(actual,name),!chain.negated);}};return chain;}
    const pm={test(name,run){try{run();}catch(e){throw Error(item.name+': '+name+' — '+e.message);}},expect,collectionVariables:{set(k,v){variables.set(k,v);},get(k){return variables.get(k);}},response:{json(){return JSON.parse(text);},headers:{get(k){return response.headers.get(k);}},to:{have:{status(code){assert.equal(response.status,code);}}}}};
    for(const event of item.event)vm.runInNewContext(event.script.exec.join('\n'),{pm},{timeout:1000});
   }}finally{await new Promise(r=>clean.close(r));}
  const output=process.argv[2];if(output)fs.writeFileSync(output,JSON.stringify(records,null,2));console.log(`API passed: ${records.length} recorded exchanges; ownership/scope, input bounds, pagination, deduplication, concurrent ETag writes, async jobs, cancellation and all 14 Postman requests/assertions.`);
 }finally{await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
