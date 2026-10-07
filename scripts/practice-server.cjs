/* In-memory, loopback-only teaching API. Public demo tokens, no real identity. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function createPracticeServer(){
 const tasks=new Map([
  ['t1',{id:'t1',owner:'alice',title:'Read the API contract',status:'open',version:1}],
  ['t2',{id:'t2',owner:'alice',title:'Try a conditional write',status:'open',version:1}],
  ['t3',{id:'t3',owner:'alice',title:'Complete the prerequisite',status:'done',version:1}],
  ['t4',{id:'t4',owner:'bob',title:'Bob’s private task',status:'open',version:1}]
 ]),tokens=new Map([['demo-alice',{id:'alice',write:true}],['demo-bob',{id:'bob',write:true}],['demo-readonly',{id:'alice',write:false}]]),dedupe=new Map(),operations=new Map();let nextTask=5,nextOperation=1;
 const view=t=>({id:t.id,title:t.title,status:t.status,version:t.version}),tag=t=>'"'+t.id+'-v'+t.version+'"';
 return http.createServer(async(req,res)=>{
  const requestId=crypto.randomUUID();res.setHeader('X-Request-Id',requestId);res.setHeader('Cache-Control','no-store');
  const send=(status,body='',headers={})=>{const data=Buffer.from(body);res.writeHead(status,{'Content-Length':data.length,...headers});res.end(req.method==='HEAD'?undefined:data);};
  const json=(status,value,headers={})=>send(status,JSON.stringify(value),{'Content-Type':'application/json; charset=utf-8',...headers});
  const problem=(status,title,detail,kind,headers={})=>send(status,JSON.stringify({type:'https://api.example.invalid/problems/'+kind,title,status,detail,instance:req.url}),{'Content-Type':'application/problem+json',...headers});
  const method=allowed=>{if(allowed.includes(req.method))return true;problem(405,'Method not allowed','Use a documented operation.','method-not-allowed',{Allow:allowed.join(', ')});return false;};
  const parseBody=async()=>{
   if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){problem(415,'Unsupported media type','Send application/json.','media-type');return;}
   const declared=Number(req.headers['content-length']);if(declared>16384){req.resume();problem(413,'Content too large','The request body limit is 16384 bytes.','body-limit');return;}
   let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>16384){req.resume();problem(413,'Content too large','The request body limit is 16384 bytes.','body-limit');return;}chunks.push(chunk);}
   let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{problem(400,'Malformed JSON','The request body is not valid JSON.','json-syntax');return;}
   if(!data||typeof data!=='object'||Array.isArray(data)){problem(422,'Validation failed','Supply a JSON object.','validation');return;}return data;
  };
  const validate=(data,patch=false)=>{
   const keys=Object.keys(data),allowed=patch?['title','status']:['title'];
   if(!keys.length||keys.some(k=>!allowed.includes(k))||(!patch&&!Object.hasOwn(data,'title'))){problem(422,'Validation failed','Supply only the documented writable fields.','validation');return false;}
   if(Object.hasOwn(data,'title')&&(typeof data.title!=='string'||[...data.title].length>120||!data.title.trim())){problem(422,'Validation failed','title must be a nonempty string of at most 120 Unicode code points.','validation');return false;}
   if(Object.hasOwn(data,'status')&&!['open','done'].includes(data.status)){problem(422,'Validation failed','status must be open or done.','validation');return false;}return true;
  };
  try{
   const url=new URL(req.url,'http://localhost'),route=url.pathname;
   if(route==='/api/v1/health'){if(!method(['GET']))return;return json(200,{status:'ok',fixture:true});}
   if(route.startsWith('/api/')){
    const authorization=req.headers.authorization||'',identity=tokens.get(authorization.replace(/^Bearer /,''));
    if(!authorization.startsWith('Bearer ')||!identity)return problem(401,'Authentication required','Use a documented local demo bearer token.','authentication',{'WWW-Authenticate':'Bearer realm="api-lms-fixture"'});
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!identity.write)return problem(403,'Write scope required','This demo identity has read access only.','scope');
    if(route==='/api/v1/tasks'){
     if(!method(['GET','POST']))return;
     if(req.method==='GET'){
      const unknown=[...url.searchParams.keys()].some(k=>!['limit','status','cursor'].includes(k)),duplicates=[...new Set(url.searchParams.keys())].some(k=>url.searchParams.getAll(k).length>1),limitText=url.searchParams.get('limit'),limit=limitText===null?2:Number(limitText),filterValue=url.searchParams.get('status'),filter=filterValue||'';
      if(unknown||duplicates||(limitText!==null&&!/^[1-3]$/.test(limitText))||!Number.isInteger(limit)||limit<1||limit>3||(filterValue!==null&&!['open','done'].includes(filterValue)))return problem(400,'Invalid query','Use a single limit 1–3, status open/done and the returned cursor.','query');
      let after=0;const cursor=url.searchParams.get('cursor');
      if(cursor!==null){try{if(!/^[A-Za-z0-9_-]+$/.test(cursor)||cursor.length>256)throw Error();const c=JSON.parse(Buffer.from(cursor,'base64url').toString());if(c.owner!==identity.id||c.filter!==filter||!Number.isSafeInteger(c.after)||c.after<1)throw Error();after=c.after;}catch{return problem(400,'Invalid cursor','Use the returned cursor with the same caller and filter.','cursor');}}
      const matching=[...tasks.values()].filter(t=>t.owner===identity.id&&(!filter||t.status===filter)&&Number(t.id.slice(1))>after).sort((a,b)=>Number(a.id.slice(1))-Number(b.id.slice(1))),page=matching.slice(0,limit),nextCursor=matching.length>limit?Buffer.from(JSON.stringify({after:Number(page.at(-1).id.slice(1)),filter,owner:identity.id})).toString('base64url'):null;
      return json(200,{items:page.map(view),nextCursor});
     }
     const data=await parseBody();if(!data||!validate(data))return;
     const now=Date.now();for(const [k,v] of dedupe)if(v.expires<=now)dedupe.delete(k);
     const key=req.headers['idempotency-key'];if(key!==undefined&&(typeof key!=='string'||!key.length||key.length>100||!/^[\x21-\x7e]+$/.test(key)))return problem(400,'Invalid idempotency key','Use 1–100 visible ASCII characters.','idempotency-key');
     const cacheKey=key?identity.id+':'+key:null,semantic=JSON.stringify({title:data.title.trim()}),previous=cacheKey?dedupe.get(cacheKey):null;
     if(previous){if(previous.semantic!==semantic)return problem(409,'Idempotency conflict','This key already identifies different input.','idempotency-conflict');return json(201,previous.result,{Location:previous.location,'Idempotent-Replay':'true'});}
     if(tasks.size>=256)return problem(429,'Fixture capacity reached','Restart the fixture to clear its bounded memory.','fixture-capacity',{'Retry-After':'10'});
     const task={id:'t'+nextTask++,owner:identity.id,title:data.title.trim(),status:'open',version:1};tasks.set(task.id,task);const result=view(task),location='/api/v1/tasks/'+task.id;
     if(cacheKey){if(dedupe.size>=256)dedupe.delete(dedupe.keys().next().value);dedupe.set(cacheKey,{semantic,result,location,expires:now+600000});}
     return json(201,result,{Location:location});
    }
    const taskMatch=route.match(/^\/api\/v1\/tasks\/(t[1-9]\d*)$/);
    if(taskMatch){
     if(!method(['GET','PATCH','DELETE']))return;
     const task=tasks.get(taskMatch[1]);if(!task||task.owner!==identity.id)return problem(404,'Task not found','No visible task exists with that ID.','not-found');
     if(req.method==='GET'){
      if(req.headers['if-none-match']===tag(task)){res.writeHead(304,{ETag:tag(task)});return res.end();}
      return json(200,view(task),{ETag:tag(task)});
     }
     if(req.method==='DELETE'){tasks.delete(task.id);res.writeHead(204);return res.end();}
     if(!req.headers['if-match'])return problem(428,'Precondition required','Read the task and send its exact ETag in If-Match.','precondition-required');
     if(req.headers['if-match']!==tag(task))return problem(412,'Precondition failed','The task changed. Read it again before resolving the conflict.','precondition-failed');
     const data=await parseBody();if(!data||!validate(data,true))return;
     if(tasks.get(task.id)!==task)return problem(404,'Task not found','The task was removed while the body was received.','not-found');
     if(req.headers['if-match']!==tag(task))return problem(412,'Precondition failed','The task changed while the body was received. Read it again.','precondition-failed');
     if(Object.hasOwn(data,'title'))task.title=data.title.trim();if(Object.hasOwn(data,'status'))task.status=data.status;task.version++;
     return json(200,view(task),{ETag:tag(task)});
    }
    if(route==='/api/v1/exports'){
     if(!method(['POST']))return;
     const data=await parseBody();if(!data)return;if(Object.keys(data).length)return problem(422,'Validation failed','The export request body must be an empty object.','validation');
     if(operations.size>=64)return problem(429,'Fixture capacity reached','Restart the fixture.','fixture-capacity',{'Retry-After':'10'});
     const id='op'+nextOperation++;operations.set(id,{id,owner:identity.id,readyAt:Date.now()+250});return json(202,{id,state:'running'},{Location:'/api/v1/operations/'+id,'Retry-After':'1'});
    }
    const opMatch=route.match(/^\/api\/v1\/operations\/(op[1-9]\d*)$/);
    if(opMatch){if(!method(['GET']))return;const op=operations.get(opMatch[1]);if(!op||op.owner!==identity.id)return problem(404,'Operation not found','No visible operation exists.','not-found');const ready=Date.now()>=op.readyAt;return json(200,{id:op.id,state:ready?'succeeded':'running',...(ready?{result:{taskCount:[...tasks.values()].filter(t=>t.owner===identity.id).length}}:{})});}
    if(route==='/api/v1/demo/rate-limit'){if(!method(['GET']))return;return problem(429,'Synthetic rate limit','This endpoint always demonstrates throttling.','demo-limit',{'Retry-After':'1'});}
    if(route==='/api/v1/demo/slow'){if(!method(['GET']))return;return setTimeout(()=>{if(!res.destroyed)json(200,{message:'Delayed fixture response'});},750);}
    return problem(404,'Route not found','Use an operation in the supplied contract.','not-found');
   }
   if(!method(['GET','HEAD']))return;
   const relative=decodeURIComponent(route==='/'?'/index.html':route),filename=path.resolve(root,'.'+relative);
   if(!filename.startsWith(root+path.sep)||relative.split('/').some(p=>p.startsWith('.'))||!fs.existsSync(filename)||!fs.statSync(filename).isFile())return problem(404,'File not found','No public fixture file exists.','not-found');
   const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.md':'text/plain; charset=utf-8'}[path.extname(filename)]||'application/octet-stream';send(200,fs.readFileSync(filename),{'Content-Type':mime});
  }catch{if(!res.headersSent)problem(400,'Invalid request','The fixture could not process the request.','request');else res.end();}
 });
}
module.exports={createPracticeServer};
if(require.main===module){const port=Number(process.env.PORT||8000);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');createPracticeServer().listen(port,'127.0.0.1',()=>console.log(`API LMS: http://localhost:${port} (Ctrl+C to stop)`));}
