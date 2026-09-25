import test from 'node:test';
import assert from 'node:assert/strict';
import { validApplicationUrl, allowBrowserRequest, browserAllowedDomains } from '../src/browser-policy.ts';
test('only supported public ATS links may launch a personal session',()=>{
 assert.equal(validApplicationUrl('https://jobs.lever.co/company/123'),true);
 for(const url of ['http://jobs.lever.co/company/123','https://jobs.lever.co.evil.test/company/123','https://127.0.0.1/job/1','https://key@jobs.lever.co/company/123','https://jobs.lever.co:8888/company/123'])assert.equal(validApplicationUrl(url),false,url);
});
test('application writes and unknown POST operations are denied',()=>{
 for(const url of ['https://jobs.lever.co/company/123/apply','https://boards.greenhouse.io/application','https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobApplicationSubmit','https://example.com/submit'])assert.equal(allowBrowserRequest('POST',url,'{}'),false,url);
 assert.equal(allowBrowserRequest('PUT','https://jobs.lever.co/company/123','{}'),false);
 assert.equal(allowBrowserRequest('POST','https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting',JSON.stringify({query:'mutation { submitApplication }'})),false);
 assert.equal(allowBrowserRequest('POST','https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting',JSON.stringify({query:'query { jobPosting { title } }'})),true);
 assert.equal(allowBrowserRequest('GET','https://jobs.lever.co/company/123',null),true);
});

test('Ashby application assets and organization reads can load without allowing submissions',()=>{
 assert.ok(browserAllowedDomains.includes('cdn.ashbyprd.com'));
 assert.ok(browserAllowedDomains.includes('www.recaptcha.net'));
 const endpoint='https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiOrganizationFromHostedJobsPageName';
 assert.equal(allowBrowserRequest('POST',endpoint,JSON.stringify({query:'query ApiOrganizationFromHostedJobsPageName { organization { name } }'})),true);
 assert.equal(allowBrowserRequest('POST',endpoint,JSON.stringify({query:'mutation { submitApplication }'})),false);
});
