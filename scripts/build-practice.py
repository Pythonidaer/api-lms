"""Build the original Tasks API OpenAPI contract and Postman exercises."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def schema_ref(name):return {'$ref':'#/components/schemas/'+name}
def response(description,schema=None,headers=None,problem=False):
    r=dict(description=description)
    if schema:r['content']={('application/problem+json' if problem else 'application/json'):{'schema':schema}}
    if headers:r['headers']={name:{'description':desc,'schema':{'type':'string'}} for name,desc in headers.items()}
    return r
def error(code,desc):return response(desc,schema_ref('Problem'),{'WWW-Authenticate':'Bearer challenge'} if code=='401' else {'Retry-After':'Wait in seconds'} if code=='429' else None,True)
errors={code:error(code,desc) for code,desc in {'400':'Malformed syntax, query, cursor or idempotency key','401':'Missing or invalid demo identity','403':'Write scope required','404':'Resource or route not visible','405':'Unsupported method','409':'Idempotency key used with different input','412':'Stale If-Match validator','413':'Body exceeds 16384 bytes','415':'Unsupported media type','422':'Invalid writable fields or values','428':'If-Match is required','429':'Synthetic throttling or bounded fixture capacity'}.items()}
def operation(id,summary,responses,params=None,body=None):
    o=dict(operationId=id,summary=summary,responses=responses)
    if params:o['parameters']=params
    if body:o['requestBody']={'required':True,'content':{'application/json':{'schema':schema_ref(body)}}}
    return o
def param(name,where,schema,required=False,description=''):
    return dict(name=name,**{'in':where},required=required,description=description,schema=schema)
def rs(codes):return {str(c):errors[str(c)] for c in codes}
TASK_HEADERS={'ETag':'Current exact validator for conditional reading/writing.'}
TASK_ID=param('id','path',{'type':'string','pattern':'^t[1-9][0-9]*$'},True,'Task identity; never confers access.')
paths={
 '/health':{'get':{**operation('getHealth','Public synthetic health check',{'200':response('Fixture is running',schema_ref('Health'))}),'security':[]}},
 '/tasks':{
  'get':operation('listTasks','List only the caller’s visible tasks',{'200':response('Ordered by numeric ID; not a snapshot',schema_ref('TaskPage')),**rs([400,401])},[
    param('limit','query',{'type':'integer','minimum':1,'maximum':3,'default':2},description='Single-digit decimal 1–3.'),
    param('status','query',{'type':'string','enum':['open','done']},description='Optional exact status filter.'),
    param('cursor','query',{'type':'string','maxLength':256},description='Opaque returned cursor, same caller/filter. Unknown or repeated query keys return 400.')]),
  'post':operation('createTask','Create a caller-owned task',{'201':response('New task or replay of original creation',schema_ref('Task'),{'Location':'URI of the created task','Idempotent-Replay':'true when replayed'}),**rs([400,401,403,409,413,415,422,429])},[
    param('Idempotency-Key','header',{'type':'string','minLength':1,'maxLength':100,'pattern':'^[!-~]+$'},description='Optional caller-scoped key. Same trimmed title replays for ten minutes while the bounded cache retains it. Changed input → 409; restarting clears retention.')],'TaskCreate')},
 '/tasks/{id}':{
  'get':operation('getTask','Read a visible task',{'200':response('Task representation',schema_ref('Task'),TASK_HEADERS),'304':response('Cached representation remains valid; no body',headers=TASK_HEADERS),**rs([401,404])},[TASK_ID,param('If-None-Match','header',{'type':'string'},description='Fixture supports an exact single validator match.')]),
  'patch':operation('updateTask','Update title/status conditionally',{'200':response('Updated task and new validator',schema_ref('Task'),TASK_HEADERS),**rs([400,401,403,404,412,413,415,422,428])},[TASK_ID,param('If-Match','header',{'type':'string'},True,'Exact current ETag; missing 428, stale 412. This fixture supports one exact validator, not wildcard/list variants.')],'TaskPatch'),
  'delete':operation('deleteTask','Delete a visible task',{'204':response('Removed; no body'),**rs([401,403,404])},[TASK_ID])},
 '/exports':{'post':operation('startExport','Accept a synthetic export operation',{'202':response('Accepted, not completed',schema_ref('OperationAccepted'),{'Location':'Operation resource','Retry-After':'Suggested wait in seconds'}),**rs([400,401,403,413,415,422,429])},body='ExportRequest')},
 '/operations/{id}':{'get':operation('getOperation','Poll an owned synthetic operation',{'200':response('Current operation state; count computed at poll time',schema_ref('Operation')),**rs([401,404])},[param('id','path',{'type':'string','pattern':'^op[1-9][0-9]*$'},True)])},
 '/demo/rate-limit':{'get':operation('getRateLimitDemo','Always return synthetic throttling',rs([401,429]))},
 '/demo/slow':{'get':operation('getSlowDemo','Delay roughly 750 ms for cancellation practice',{'200':response('Delayed response',schema_ref('SlowResponse')),**rs([401])})}
}
# A generic unsupported-method response is part of every declared operation.
for path in paths.values():
 for o in path.values():o['responses']['405']=error('405','Unsupported method; Allow lists fixture operations.')
TITLE={'type':'string','minLength':1,'maxLength':120,'pattern':r'\S','description':'Trimmed before storage; must include a non-whitespace character. Length counts Unicode code points.'}
TASK_PROPS=dict(id={'type':'string','pattern':'^t[1-9][0-9]*$'},title=TITLE,status={'type':'string','enum':['open','done']},version={'type':'integer','minimum':1})
schemas={
 'Task':{'type':'object','required':list(TASK_PROPS),'properties':TASK_PROPS,'additionalProperties':False},
 'TaskCreate':{'type':'object','required':['title'],'properties':{'title':TITLE},'additionalProperties':False},
 'TaskPatch':{'type':'object','minProperties':1,'properties':{'title':TITLE,'status':TASK_PROPS['status']},'additionalProperties':False},
 'TaskPage':{'type':'object','required':['items','nextCursor'],'properties':{'items':{'type':'array','maxItems':3,'items':schema_ref('Task')},'nextCursor':{'type':['string','null']}},'additionalProperties':False},
 'Problem':{'type':'object','required':['type','title','status','detail','instance'],'properties':{'type':{'type':'string','format':'uri'},'title':{'type':'string'},'status':{'type':'integer','minimum':400,'maximum':599},'detail':{'type':'string'},'instance':{'type':'string'}},'additionalProperties':False},
 'Health':{'type':'object','required':['status','fixture'],'properties':{'status':{'const':'ok'},'fixture':{'const':True}},'additionalProperties':False},
 'ExportRequest':{'type':'object','maxProperties':0,'additionalProperties':False},
 'OperationAccepted':{'type':'object','required':['id','state'],'properties':{'id':{'type':'string'},'state':{'const':'running'}},'additionalProperties':False},
 'Operation':{'type':'object','required':['id','state'],'properties':{'id':{'type':'string'},'state':{'type':'string','enum':['running','succeeded']},'result':{'type':'object','required':['taskCount'],'properties':{'taskCount':{'type':'integer','minimum':0}},'additionalProperties':False}},'additionalProperties':False},
 'SlowResponse':{'type':'object','required':['message'],'properties':{'message':{'type':'string'}},'additionalProperties':False}}
spec=dict(openapi='3.1.0',info=dict(title='API LMS Tasks fixture',version='1.0.0',description='Original synthetic loopback teaching API. Public demo labels are not production credentials. Bounded, memory-only state; restart resets everything. Unsupported methods use 405; unknown routes use 404. Reader files are outside this API contract.'),servers=[{'url':'http://localhost:8000/api/v1','description':'Local practice server only'}],security=[{'bearerAuth':[]}],paths=paths,components=dict(schemas=schemas,securitySchemes={'bearerAuth':{'type':'http','scheme':'bearer','description':'Fixed local labels: demo-alice, demo-bob, demo-readonly. No JWT or OAuth issuance/validation.'}}))
(ROOT/'practice/openapi.json').write_text(json.dumps(spec,indent=2)+'\n')

def item(name,method,route,code,body=None,headers=None,checks=None,noauth=False):
    req={'method':method,'header':[{'key':k,'value':v} for k,v in (headers or {}).items()],'url':'{{baseUrl}}'+route}
    if noauth:req['auth']={'type':'noauth'}
    if body is not None:
        req['header'].append({'key':'Content-Type','value':'application/json'});req['body']={'mode':'raw','raw':json.dumps(body),'options':{'raw':{'language':'json'}}}
    lines=[f'pm.test("Expected HTTP {code}", () => pm.response.to.have.status({code}));']+(checks or [])
    return {'name':name,'request':req,'event':[{'listen':'test','script':{'type':'text/javascript','exec':lines}}]}
collection={'info':{'name':'API LMS — Tasks contract practice','description':'Run in order against a fresh local fixture. Public demo tokens only. Restart the server before repeating a full run. Uses collection variables for generated IDs and validators.','schema':'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'},'auth':{'type':'bearer','bearer':[{'key':'token','value':'{{token}}','type':'string'}]},'variable':[{'key':'baseUrl','value':'http://localhost:8000/api/v1'},{'key':'token','value':'demo-alice'},{'key':'createKey','value':'postman-practice-create'}],'item':[
 item('01 Public health','GET','/health',200,noauth=True,checks=['pm.test("Fixture identity", () => pm.expect(pm.response.json().fixture).to.eql(true));']),
 item('02 Missing identity','GET','/tasks',401,noauth=True,checks=['pm.test("Problem media type", () => pm.expect(pm.response.headers.get("Content-Type")).to.include("application/problem+json"));']),
 item('03 List one visible task','GET','/tasks?limit=1',200,checks=['pm.test("Bounded page", () => pm.expect(pm.response.json().items).to.have.lengthOf(1));','pm.test("Owner field stays private", () => pm.expect(pm.response.json().items[0]).not.to.have.property("owner"));']),
 item('04 Create task','POST','/tasks',201,body={'title':'Practice API contract'},headers={'Idempotency-Key':'{{createKey}}'},checks=['pm.collectionVariables.set("createdId", pm.response.json().id);','pm.test("Location", () => pm.expect(pm.response.headers.get("Location")).to.include(pm.response.json().id));']),
 item('05 Replay creation','POST','/tasks',201,body={'title':'Practice API contract'},headers={'Idempotency-Key':'{{createKey}}'},checks=['pm.test("Same task", () => pm.expect(pm.response.json().id).to.eql(pm.collectionVariables.get("createdId")));','pm.test("Replay marker", () => pm.expect(pm.response.headers.get("Idempotent-Replay")).to.eql("true"));']),
 item('06 Different input conflicts','POST','/tasks',409,body={'title':'Different intended task'},headers={'Idempotency-Key':'{{createKey}}'}),
 item('07 Read created task','GET','/tasks/{{createdId}}',200,checks=['pm.collectionVariables.set("originalEtag", pm.response.headers.get("ETag"));']),
 item('08 Conditional update','PATCH','/tasks/{{createdId}}',200,body={'status':'done'},headers={'If-Match':'{{originalEtag}}'},checks=['pm.test("State changed", () => pm.expect(pm.response.json().status).to.eql("done"));','pm.test("Version advanced", () => pm.expect(pm.response.json().version).to.eql(2));']),
 item('09 Stale update denied','PATCH','/tasks/{{createdId}}',412,body={'title':'Overwrite attempt'},headers={'If-Match':'{{originalEtag}}'}),
 item('10 Other owner denied','GET','/tasks/t4',404),
 item('11 Reject owner assignment','POST','/tasks',422,body={'title':'Forbidden field','owner':'bob'}),
 item('12 Synthetic throttling','GET','/demo/rate-limit',429,checks=['pm.test("Retry hint", () => pm.expect(pm.response.headers.get("Retry-After")).to.eql("1"));']),
 item('13 Delete created task','DELETE','/tasks/{{createdId}}',204),
 item('14 Confirm absence','GET','/tasks/{{createdId}}',404)
]}
(ROOT/'practice/tasks.postman_collection.json').write_text(json.dumps(collection,indent=2)+'\n')
print('Built OpenAPI contract and 14-request Postman collection.')
