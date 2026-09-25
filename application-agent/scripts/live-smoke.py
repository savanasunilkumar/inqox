"""Validate the live flow using an isolated profile; never print access tokens."""
import json, subprocess, time, sys
from pathlib import Path
BASE='https://applyit-application-agent.black-poetry-4fa5.workers.dev'
TOKEN=subprocess.check_output(['gcloud','auth','print-identity-token','--account=aniflixx-api@aniflixx-production.iam.gserviceaccount.com','--audiences='+BASE],text=True).strip()
def request(path,method='GET',body=None,kind='application/json',auth=True):
    config=''
    if auth: config+='header = "Authorization: Bearer '+TOKEN+'"\n'
    config+='header = "Content-Type: '+kind+'"\n'
    if body is not None:
        data=body if isinstance(body,bytes) else json.dumps(body).encode()
        # Curl reads headers from a temporary inherited descriptor and body from stdin.
        import tempfile, os
        with tempfile.TemporaryFile() as headers:
            headers.write(config.encode());headers.seek(0)
            result=subprocess.run(['curl','--silent','--show-error','--max-time','60','--config','/dev/fd/'+str(headers.fileno()),'--request',method,'--data-binary','@-','--write-out','\n%{http_code}',BASE+path],input=data,stdout=subprocess.PIPE,pass_fds=(headers.fileno(),),check=True)
    else:
        result=subprocess.run(['curl','--silent','--show-error','--max-time','30','--config','-','--request',method,'--write-out','\n%{http_code}',BASE+path],input=config.encode(),stdout=subprocess.PIPE,check=True)
    body,code=result.stdout.rsplit(b'\n',1)
    return int(code),body
for path in ['/profile','/profile/resume','/runs/current','/runs/screenshot','/validation/profile']:
    assert request(path,auth=False)[0]==401, 'Private route accepted an anonymous request'
print('Private profile, résumé, and session endpoints reject anonymous requests.',flush=True)
request('/validation/runs/stop','POST',{})
fields={'firstName':'Validation','lastName':'Candidate','email':'validation@example.com','phone':'+1 202 555 0100','linkedIn':'https://www.linkedin.com/in/validation-example','workCountry':'United States','authorizedToWork':'Yes','sponsorshipNow':'No','sponsorshipFuture':'Yes'}
code,body=request('/validation/profile','PUT',{'fields':fields,'customAnswers':[{'question':'Why do you want this role at Example?','answer':'This is an isolated application agent test.'}]})
assert code==200,(code,body.decode())
# Minimal PDF fixture with selectable text and a valid cross-reference table.
content=b'BT /F1 16 Tf 60 720 Td (Validation Candidate) Tj 0 -24 Td (Built a Python service for an application project.) Tj 0 -24 Td (Deployed the service on AWS.) Tj 0 -24 Td (The service uses PostgreSQL for data storage.) Tj 0 -24 Td (validation@example.com) Tj ET'
objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(content)).encode()+b' >>\nstream\n'+content+b'\nendstream']
pdf=bytearray(b'%PDF-1.4\n');offsets=[0]
for i,obj in enumerate(objects,1): offsets.append(len(pdf));pdf+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
xref=len(pdf);pdf+=b'xref\n0 6\n0000000000 65535 f \n'
for off in offsets[1:]:pdf+=f'{off:010} 00000 n \n'.encode()
pdf+=b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+str(xref).encode()+b'\n%%EOF\n'
code,body=request('/validation/profile/resume','PUT',bytes(pdf),'application/pdf')
assert code==200,(code,body.decode())
profile=json.loads(body);assert 'Validation Candidate' in profile['resume']['text']
code,download=request('/validation/profile/resume');assert code==200 and download==pdf
assert request('/validation/profile/resume','PUT',b'not a PDF','application/pdf')[0]==400
print('PDF upload, extraction, private R2 persistence, exact download, and invalid-file rejection passed.',flush=True)
code,body=request('/validation/runs/start','POST',{'test':True});assert code==202,(code,body.decode())
run=json.loads(body);identifier=run['id'];last=''
try:
    for _ in range(35):
        code,body=request('/validation/runs/current');assert code==200
        run=json.loads(body);assert run['id']==identifier
        if run['status']!=last:print('Session status: '+run['status'],flush=True);last=run['status']
        if run['status'] in ['review','needs_attention','failed','stopped','expired']:break
        time.sleep(3)
    safe={key:run.get(key) for key in ['id','status','filled','unanswered','submitted','matches','reasoner']}
    safe['live_view_available']=bool(run.get('liveUrl'))
    print(json.dumps(safe,indent=2),flush=True)
    Path('reports/live-validation.json').write_text(json.dumps(safe,indent=2)+'\n')
    assert run['status'] in ['review','needs_attention'], 'Live run did not reach review'
    assert len(run['filled'])>=10, 'Too few fields were filled'
    assert run.get('reasoner',{}).get('status') in ['prepared','cached'], 'GLM did not prepare an answer'
    assert run['reasoner']['accepted']>=1, 'Jev did not accept a GLM answer'
    assert any(m['choice'].startswith('glm_') for m in run.get('matches',[])), 'No GLM answer was selected'
    assert run.get('liveUrl') and run['submitted'] is False
    code,image=request('/validation/runs/screenshot');assert code==200 and image[:2]==b'\xff\xd8'
    Path('reports/live-validation.jpg').write_bytes(image)
    Path('reports/live-validation.json').write_text(json.dumps(safe,indent=2)+'\n')
    assert any('referral' in value.lower() for value in run['unanswered'])
    assert any('agree' in value.lower() for value in run['unanswered'])
    assert request('/fixture/submit','POST',{},auth=False)[0]==405
    print('GLM answer preparation, Jev verification, screenshot, unknown-answer handling, and disabled submission verified.',flush=True)
    if '--check-cache' in sys.argv:
        request('/validation/runs/stop','POST',{})
        code,body=request('/validation/runs/start','POST',{'test':True});assert code==202
        for _ in range(35):
            time.sleep(3);code,body=request('/validation/runs/current');cached=json.loads(body)
            if cached['status'] in ['review','needs_attention','failed','stopped','expired']:break
        assert cached.get('reasoner',{}).get('status')=='cached', 'Repeated run did not reuse GLM answer'
        assert cached['reasoner']['accepted']>=1 and cached['submitted'] is False
        print('Second run reused the cached GLM plan and reverified it with Jev.',flush=True)
finally:
    request('/validation/runs/stop','POST',{})
    request('/validation/profile/resume','DELETE')
    request('/validation/profile','PUT',{'fields':{},'customAnswers':[]})
    print('Validation browser closed and temporary profile data cleared.',flush=True)
