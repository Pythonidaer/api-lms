"""Build API core course and the complete explicitly selected source documents.

Authoring: Python + beautifulsoup4 + markdownify. Reader: no dependencies.
"""
import hashlib,json,re
from collections import defaultdict
from pathlib import Path
from urllib.parse import urljoin
from markdownify import markdownify
from curriculum import make_course, EXTERNAL_SOURCES, TOPIC_MAP
ROOT=Path(__file__).resolve().parents[1]
MDN='https://developer.mozilla.org/en-US/docs/'
inventory=json.loads((ROOT/'docs/source-inventory.json').read_text())

# Reuse the HTTP author's macro conversion and paragraph-safe splitting.

def macro(match):
    name=match[1].lower();args=re.findall(r'"([^"]*)"',match[2] or '')
    if name in ('specifications','compat','subpageswithsummaries','interactiveexample','embedlivesample','previousmenunext','apiref'):return ''
    badges={'experimental_inline':'Experimental','seecompattable':'Experimental: check current support','deprecated_inline':'Deprecated','non-standard_inline':'Non-standard','securecontext_header':'Requires a secure context','optional_inline':'optional'}
    if name in badges:return '('+badges[name]+')'
    if not args:return ''
    key=args[0];label=args[1] if len(args)>1 else key
    if name=='httpheader':slug='Web/HTTP/Reference/Headers/'+key
    elif name=='httpmethod':slug='Web/HTTP/Reference/Methods/'+key
    elif name=='httpstatus':slug='Web/HTTP/Reference/Status/'+key
    elif name=='csp':slug='Web/HTTP/Reference/Headers/Content-Security-Policy/'+key
    elif name=='glossary':slug='Glossary/'+key
    elif name=='domxref':slug='Web/API/'+key.removesuffix('()').replace('.','/')
    elif name=='htmlelement':slug='Web/HTML/Reference/Elements/'+key
    elif name=='svgelement':slug='Web/SVG/Reference/Element/'+key
    elif name=='cssxref':slug='Web/CSS/'+key
    elif name=='jsxref':
        key=key.removesuffix('()');slug='Web/JavaScript/Reference/'+key if key.startswith(('Operators/','Statements/')) else 'Web/JavaScript/Reference/Global_Objects/'+key.replace('.','/')
    elif name=='rfc':
        nums=re.findall(r'\d+',match[2] or '');number=nums[0] if nums else key
        return f'[RFC {number}](https://www.rfc-editor.org/rfc/rfc{number}.html)'
    else:return label
    return f'[`{label}`]({MDN+slug.replace(" ","_")})'

def clean(body,url,source_path,item):
    # Protect code: even HTML examples and comments must remain verbatim inert text.
    code=[]
    def protect(m):
        code.append(re.sub(r'^```([^\s`]+)[^\n]*',r'```\1',m[0]));return f'HTTP_CODE_TOKEN_{len(code)-1}_END'
    body=re.sub(r'^```[^\n]*\n.*?^```\s*$',protect,body,flags=re.S|re.M)
    body=re.sub(r'<!--.*?-->','',body,flags=re.S)
    body=re.sub(r'\{\{\s*([\w-]+)(?:\((.*?)\))?\s*\}\}',macro,body)
    # Markdownify only actual HTML fragments; leave source Markdown intact.
    body=re.sub(r'<(table|dl|ul|ol)(?:\s[^>]*)?>.*?</\1>',lambda m:markdownify(m[0],heading_style='ATX').strip(),body,flags=re.S)
    body=re.sub(r'<a\s[^>]*>.*?</a>',lambda m:markdownify(m[0]).strip(),body,flags=re.S)
    body=re.sub(r'<summary>(.*?)</summary>',r'**\1**',body,flags=re.S)
    body=re.sub(r'</?(?:details|div|span|sup|section)(?:\s[^>]*)?>','',body)
    body=body.replace('> [!NOTE]','> **Note:**').replace('> [!WARNING]','> **Warning:**').replace('> [!TIP]','> **Tip:**')
    body=body.replace('](/en-US/docs/',']('+MDN)
    body=re.sub(r'\]\(#([^)]*)\)',lambda m:']('+url+'#'+m[1]+')',body)
    body=re.sub(r'!\[([^\]]*)\]\(([^)]*)\)',lambda m:'[Diagram: '+m[1]+']('+ (m[2] if m[2].startswith('http') else f'https://raw.githubusercontent.com/{item["repository"]}/{item["commit"]}/'+str(Path(source_path).parent/m[2])) +')',body)
    body=re.sub(r'(?<!!)\[([^\]]*)\]\(([^)]+)\)',lambda m:'['+m[1]+']('+urljoin(url,m[2])+')',body)
    for i,c in enumerate(code):body=body.replace(f'HTTP_CODE_TOKEN_{i}_END',c)
    return body.strip()

def parts(body,limit=12500):
    # Split at paragraph boundaries outside code, never in the middle of a fence.
    blocks=[];buf=[];fence=False
    for line in body.splitlines():
        if line.lstrip().startswith('```'):fence=not fence
        if not line.strip() and not fence:
            if buf:blocks.append('\n'.join(buf));buf=[]
        else:buf.append(line)
    if buf:blocks.append('\n'.join(buf))
    out=[];buf=''
    for block in blocks:
        if len(block)>limit:
            if block.startswith('```'):raise ValueError('Oversized code example')
            if buf:out.append(buf);buf=''
            # Large lists/tables are divided on complete rows, retaining their order.
            rows=block.splitlines();header=''
            if len(rows)>1 and re.match(r'^\|.*\|$',rows[0]) and re.match(r'^\|[- :|]+\|$',rows[1]):header='\n'.join(rows[:2]);rows=rows[2:]
            chunk=header
            for row in rows:
                if len(chunk)+len(row)+1>limit:out.append(chunk);chunk=header
                chunk+=(('\n' if chunk else '')+row)
            if chunk:out.append(chunk)
        elif len(buf)+len(block)+2>limit:
            out.append(buf);buf=block
        else:buf+=(('\n\n' if buf else '')+block)
    if buf:out.append(buf)
    return out


def preprocess(text,item):
    protected=[]
    def protect(m):
        protected.append(m[0]);return f'API_PREPROCESS_CODE_{len(protected)-1}_END'
    text=re.sub(r'^```[^\n]*\n.*?^```[^\S\n]*$',protect,text,flags=re.S|re.M)
    # Convert document-wide reference links before splitting into slide-sized pieces.
    definitions=dict(re.findall(r'^\[([^\]]+)\]:\s*(\S+).*$',text,re.M))
    text=re.sub(r'^\[([^\]]+)\]:\s*(\S+).*$', '',text,flags=re.M)
    text=re.sub(r'\[([^\]]+)\]\[([^\]]*)\]',lambda m:'['+m[1]+']('+definitions.get(m[2] or m[1],item['url'])+')',text)
    # OpenAPI's source uses publication bibliography markers; the authoritative
    # published HTML resolves these. Link remaining markers to that rendering.
    text=re.sub(r'\[\[\??([^\]]+)\]\]',lambda m:'['+m[1]+']('+item['url']+')',text)
    text=re.sub(r'<a\s[^>]*(?:name|id)=[^>]*></a>','',text)
    text=re.sub(r'<a\s[^>]*(?:name|id)=[^>]*>([^<]+)</a>',r'\1',text)
    text=text.replace(':white_check_mark:','✓').replace(':x:','✗').replace(':warning:','⚠')
    for i,code in enumerate(protected):text=text.replace(f'API_PREPROCESS_CODE_{i}_END',code)
    return text

def reference(item):
    raw=(ROOT/item['localPath']).read_text();text=raw;flags=[]
    if item['repository']=='mdn/content':
        front,text=raw.split('---',2)[1:]
        title=re.search(r'^title: (.+)$',front,re.M)[1].strip('"\'')
        slug=re.search(r'^slug: (.+)$',front,re.M)[1];item['url']=MDN+slug
        for badge in ('experimental','deprecated','non-standard'):
            if re.search(r'^\s*- '+re.escape(badge)+r'\s*$',front,re.M):flags.append(badge)
    else:title=re.search(r'^# (.+)$',text,re.M)[1] if re.search(r'^# (.+)$',text,re.M) else Path(item['path']).stem
    if item['repository'].startswith('OAI'):title+=' '+Path(item['path']).stem
    if item['path']=='Guidelines.md':title='Microsoft deprecated-guidelines notice';flags.append('deprecated')
    text=preprocess(text,item)
    chunks=[];heading=title;buf=[];fence=False
    for line in text.splitlines():
        if line.lstrip().startswith('```'):fence=not fence
        if not fence and re.match(r'^#{1,6} ',line):
            if '\n'.join(buf).strip():chunks.append((heading,'\n'.join(buf)))
            heading=re.sub(r'^#+ ','',line);buf=[]
        else:buf.append(line)
    if '\n'.join(buf).strip():chunks.append((heading,'\n'.join(buf)))
    # The long normative specifications are split into individually searchable
    # chapter decks, while the original complete documents remain available.
    split=item['repository']=='OAI/OpenAPI-Specification';chapters=[];current=[];chapter_title=title
    if split:
        boundaries=set(re.findall(r'^#{2,3} (.+)$',text,re.M))
        for heading,body in chunks:
            if heading in boundaries and current:chapters.append((chapter_title,current));current=[]
            if not current:chapter_title=heading
            current.append((heading,body))
        if current:chapters.append((chapter_title,current))
    else:chapters=[(title,chunks)]
    decks=[];license_url={'CC BY-SA 2.5':'https://creativecommons.org/licenses/by-sa/2.5/','CC BY-SA 4.0':'https://creativecommons.org/licenses/by-sa/4.0/','CC BY 4.0':'https://creativecommons.org/licenses/by/4.0/','Apache-2.0':'https://www.apache.org/licenses/LICENSE-2.0.html'}[item['license']]
    for chapter_index,(chapter_title,chunks) in enumerate(chapters):
        label=(title+' — '+chapter_title) if split and chapter_title!=title else title
        id='ref-'+hashlib.sha256((item['repository']+item['path']+chapter_title+str(chapter_index)).encode()).hexdigest()[:16]
        intro='Optional reference, outside required progression.\n\nSource: ['+title+']('+item['url']+'). Contributors: '+item['repository']+'. Adapted under ['+item['license']+']('+license_url+'). Snapshot: 2026-10-07; upstream commit `'+item['commit']+'`.\n\n[Complete original source snapshot]('+item['localPath']+')'
        if flags:intro+='\n\n**Source notices:** '+', '.join(flags)+'.'
        if item['repository'].startswith('microsoft'):intro+='\n\nThese are Microsoft/Azure organizational conventions. Their SHOULD/MUST policies are not universal REST or HTTP requirements. The root notice redirects readers to newer guidance.'
        if split:intro+='\n\nVersion-specific normative material. Guided examples use the 3.1 feature set; 3.2 chapters are optional extension reading. Consult published HTML for authoritative bibliography/section cross-references.'
        slides=[dict(id=id+'-s1',title='How to use this reference',body=intro)]
        for heading,body in chunks:
            if heading.lower() in ('specifications','browser compatibility') and item['repository']=='mdn/content':body=f'Consult [MDN’s current {heading.lower()} section]({item["url"]}#{heading.lower().replace(" ","_")}) for generated specification links and engine-support tables.'
            else:body=clean(body,item['url'],item['path'],item)
            if not body:continue
            pieces=parts(body)
            for i,piece in enumerate(pieces):slides.append(dict(id=id+f'-s{len(slides)+1}',title=heading+(f' — part {i+1}' if len(pieces)>1 else ''),body=piece))
        decks.append(dict(id=id,type='slides',title=label,optional=True,slides=slides))
    source={**item,'title':title,'sha256':hashlib.sha256(raw.encode()).hexdigest(),'lessonIds':[d['id'] for d in decks],'headings':re.findall(r'^#{1,6} (.+)$',text,re.M),'flags':flags}
    return decks,source

course=make_course();groups=defaultdict(list);sources=[]
for item in inventory:
    if item.get('isLicense'):continue
    decks,source=reference(item);sources.append(source)
    group=item['group']
    if item['repository'].startswith('OAI'):group+=' '+Path(item['path']).stem
    groups[group].extend(decks)
for i,s in enumerate(EXTERNAL_SOURCES):
    id=f'external-reference-{i+1}'
    groups['Testing tools and additional standards'].append(dict(id=id,type='slides',title=s['title'],optional=True,slides=[dict(id=id+'-s1',title=s['title'],body=s['summary']+'\n\n['+s['title']+']('+s['url']+')\n\nThis is an original reading guide, not a full copy of the external page. Consult current documentation for tool-specific interfaces and availability.')]))
children=[]
for i,(name,decks) in enumerate(groups.items()):children.append(dict(id=f'reference-group-{i+1}',type='section',title=name,collapsed=True,children=decks))
course['sections'].append(dict(id='reference-library',type='section',title='Reference collection — optional',collapsed=True,children=children))
(ROOT/'course.json').write_text(json.dumps(course,ensure_ascii=False,indent=2)+'\n')
embedded=json.dumps(course,ensure_ascii=False).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')
(ROOT/'index.html').write_text('<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Learn API consumption, design, contracts, security, testing and reliable integrations."><title>API</title><link rel="stylesheet" href="lms.css"><script src="vendor/marked.umd.js" defer></script><script src="lesson-markdown.js" defer></script><script src="lms-runtime.js" defer></script></head><body class="lms-export-body"><div id="lms-root"></div><script id="lms-course-data" type="application/json">'+embedded+'</script></body></html>\n')
manifest=dict(retrievedAt='2026-10-07',scope='Complete text of the 37 explicitly selected licensed documents; curated external-tool reading guides. Not every API page from each provider.',sources=sources,externalReferences=EXTERNAL_SOURCES,topics=TOPIC_MAP,licenses=[i for i in inventory if i.get('isLicense')])
(ROOT/'source-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
flat=[]
def walk(nodes):
    for n in nodes:
        if n['type']=='section':walk(n['children'])
        else:flat.append(n)
walk(course['sections'])
stats=dict(coreDecks=sum(n['type']=='slides' and not n.get('optional') for n in flat),coreSlides=sum(len(n.get('slides',[])) for n in flat if not n.get('optional')),referenceDocuments=len(sources),referenceDecks=sum(bool(n.get('optional')) for n in flat),referenceSlides=sum(len(n.get('slides',[])) for n in flat if n.get('optional')),moduleQuizzes=sum(n['type']=='quiz' for n in flat),moduleQuestions=sum(len(n.get('questions',[])) for n in flat),finalQuestions=len(course['finalQuiz']['questions']))
(ROOT/'course-stats.json').write_text(json.dumps(stats,indent=2)+'\n');print(json.dumps(stats))
