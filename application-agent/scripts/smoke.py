"""Run the authenticated Cloudflare connectivity test; credentials never print."""
import json
import subprocess
from pathlib import Path

BASE = 'https://applyit-application-agent.black-poetry-4fa5.workers.dev'
ACCOUNT = 'aniflixx-api@aniflixx-production.iam.gserviceaccount.com'


def request(path, token=None, method='GET'):
    # Pass credentials on stdin, never in process arguments or printed output.
    config = f'header = "Authorization: Bearer {token}"\n' if token else ''
    result = subprocess.run(['curl', '--silent', '--show-error', '--max-time', '100',
        '--config', '-', '--request', method, '--write-out', '\n%{http_code}', BASE + path],
        input=config.encode(), stdout=subprocess.PIPE, check=True)
    body, code = result.stdout.rsplit(b'\n', 1)
    return int(code), body

for token in (None, 'invalid'):
    code, _ = request('/test/result', token)
    assert code == 401, f'Expected unauthenticated rejection, received {code}'

token = subprocess.check_output(['gcloud', 'auth', 'print-identity-token',
    '--account=' + ACCOUNT, '--audiences=' + BASE], text=True).strip()
code, body = request('/test/run', token, 'POST')
if code != 200:
    raise RuntimeError(f'Agent returned {code}: {body.decode()}')
report = json.loads(body)
folder = Path(__file__).resolve().parents[1] / 'reports'
folder.mkdir(exist_ok=True)
(folder / 'connection-test.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
code, body = request('/test/result', token)
assert code == 200 and json.loads(body)['id'] == report['id'], 'Agent state did not persist'
print('Authentication and persisted agent state verified.')
if report.get('checks', {}).get('form', {}).get('ok'):
    code, body = request('/test/screenshot', token)
    assert code == 200
    (folder / 'connection-test.png').write_bytes(body)
    print('Screenshot saved to reports/connection-test.png')

assert report['status'] == 'passed', 'Connection test blocked; see the report above.'
