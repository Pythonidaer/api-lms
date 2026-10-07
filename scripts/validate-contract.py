"""Validate the OpenAPI description and recorded real API responses."""
import json,re,sys
from pathlib import Path
from openapi_spec_validator import validate
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parents[1]
spec=json.loads((ROOT/'practice/openapi.json').read_text())
validate(spec)
registry=Registry().with_resource('urn:api-lms-contract',Resource.from_contents({**spec,'$schema':'https://json-schema.org/draft/2020-12/schema'}))
records=json.loads(Path(sys.argv[1]).read_text()) if len(sys.argv)>1 else []
for record in records:
    route=record['path'].split('?')[0].removeprefix('/api/v1')
    matched=None
    for template,path in spec['paths'].items():
        pattern='^'+re.sub(r'\\\{[^}]+\\\}',r'[^/]+',re.escape(template))+'$'
        if re.match(pattern,route):matched=path;break
    assert matched is not None,route
    operation=matched.get(record['method'].lower())
    if operation is None:
        assert record['status']==405,record
        # Generic unsupported operation outcomes use the same Problem contract.
        schema={'$ref':'urn:api-lms-contract#/components/schemas/Problem'}
    else:
        response=operation['responses'].get(str(record['status']))
        assert response is not None,(route,record['status'])
        if record['body'] is None:
            assert 'content' not in response,(route,record['status'])
            continue
        content_type=record['headers']['content-type'].split(';')[0]
        schema=response['content'][content_type]['schema']
        schema=json.loads(json.dumps(schema).replace('"#/','"urn:api-lms-contract#/'))
    Draft202012Validator(schema,registry=registry).validate(record['body'])
print(f'OpenAPI 3.1 validated; {len(records)} live response shapes/status/media-type outcomes checked against the declared contract.')
