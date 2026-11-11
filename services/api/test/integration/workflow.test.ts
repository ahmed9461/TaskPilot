import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {createPool} from '../../src/db.js';import {migrate} from '../../src/migrate.js';import{createApp}from'../../src/app.js';
import{dispatchOne,startMockWorker}from'../../src/outbox.js';import{MockTransport}from'../../src/transport.js';
const url=process.env.TASKPILOT_TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test'))throw new Error('DEDICATED_TEST_DATABASE_REQUIRED');
test('PostgreSQL synthetic end-to-end and adversarial workflows',async t=>{
 await migrate(url);await migrate(url);const pool=createPool(url);
 await pool.query('TRUNCATE whatsapp_sessions,task_types,accounts,source_messages,reply_templates,approvals,notifications,audit_events CASCADE');
 const config={apiToken:randomBytes(32).toString('hex'),reauthSecret:randomBytes(32).toString('hex'),encryptionKey:randomBytes(32).toString('base64'),mockEnabled:true};
 const app=await createApp(pool,config);t.after(async()=>{await app.close();await pool.end();});
 const headers={authorization:`Bearer ${config.apiToken}`};const sensitive={...headers,'x-reauth-secret':config.reauthSecret};
 async function api(method:any,path:string,body?:any,reauth=false){const r=await app.inject({method,url:path,headers:reauth?sensitive:headers,...(body?{payload:body}:{})});assert.ok(r.statusCode<300,`${path}: ${r.statusCode} ${r.body}`);return r.json();}
 const session=await api('POST','/v1/sessions',{label:'Synthetic session A'});
 const session2=await api('POST','/v1/sessions',{label:'Synthetic session B'});
 const task=await api('POST','/v1/task-types',{code:'self',name:'الذاتي'});
 const task2=await api('POST','/v1/task-types',{code:'periodic',name:'الدوري'});
 const group=await api('POST','/v1/groups',{sessionId:session.id,externalGroupId:'mock-group-a',title:'مجموعة وهمية أ',taskTypeId:task.id,namespace:'synthetic',periodKey:'2026-T1'});
 const group2=await api('POST','/v1/groups',{sessionId:session2.id,externalGroupId:'mock-group-b',title:'مجموعة وهمية ب',taskTypeId:task2.id,namespace:'synthetic',periodKey:'2026-T1'});
 const message={sessionId:session.id,groupId:group.id,externalMessageId:'fixture-1',text:'name: حساب تجريبي\nuser: DEMO-A\npassword: fixture-secret'};
 let assignment:any;let account:any;let template:any;let job:any;
 await t.test('authentication, reauthentication, validation and secret-free errors',async()=>{
  assert.equal((await app.inject({url:'/v1/accounts'})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/v1/accounts',headers,payload:{password:'sensitive-canary'}})).body.includes('sensitive-canary'),false);
  assert.equal((await app.inject({url:'/ready'})).statusCode,401);
  assert.equal((await api('GET','/v1/me')).liveSendingEnabled,false);
  assert.equal((await app.inject({method:'POST',url:'/v1/sessions/pairing-request',headers})).statusCode,403);
 });
 await t.test('concurrent replay produces exactly one source and assignment',async()=>{
  const results=await Promise.all(Array.from({length:12},()=>api('POST','/v1/mock/messages',message)));
  assert.equal(results.filter(x=>!x.duplicate).length,1);assert.equal((await api('GET','/v1/assignments')).length,1);
  const more=await Promise.all(Array.from({length:6},(_,i)=>api('POST','/v1/mock/messages',{...message,externalMessageId:`concurrent-${i}`})));
  assert.equal(more.length,6);assignment=(await api('GET','/v1/assignments'))[0];assert.equal(assignment.sources.length,7);
 });
 await t.test('same account has distinct tasks, periods and namespaces; cross-session spoof denied',async()=>{
  await api('POST','/v1/mock/messages',{...message,sessionId:session2.id,groupId:group2.id});
  assert.equal((await api('GET','/v1/accounts')).length,1);assert.equal((await api('GET','/v1/assignments')).length,2);
  assert.equal((await app.inject({method:'POST',url:'/v1/mock/messages',headers,payload:{...message,sessionId:session2.id}})).statusCode,403);
  const third=await api('POST','/v1/groups',{sessionId:session.id,externalGroupId:'period-2',title:'فترة ثانية',taskTypeId:task.id,namespace:'synthetic',periodKey:'2026-T2'});
  await api('POST','/v1/mock/messages',{...message,groupId:third.id});assert.equal((await api('GET','/v1/assignments')).length,3);
  await api('POST','/v1/accounts',{namespace:'other',username:'demo-a',displayName:'Namespace fixture'});assert.equal((await api('GET','/v1/accounts')).length,2);
  account=(await api('GET','/v1/accounts')).find((a:any)=>a.namespace==='synthetic');
 });
 await t.test('credentials and raw message minimized, encrypted and never in list/audit/notifications',async()=>{
  const stored=(await pool.query('SELECT ciphertext FROM account_credentials WHERE account_id=$1',[account.id])).rows[0].ciphertext;
  assert.equal(stored.includes('fixture-secret'),false);assert.equal(Number((await pool.query('SELECT count(*) FROM source_messages WHERE encrypted_payload IS NOT NULL')).rows[0].count),0);
  for(const path of ['/v1/accounts','/v1/audit','/v1/notifications'])assert.equal(JSON.stringify(await api('GET',path)).includes('fixture-secret'),false);
  assert.equal((await app.inject({method:'POST',url:`/v1/accounts/${account.id}/reveal`,headers})).statusCode,403);
  assert.equal((await api('POST',`/v1/accounts/${account.id}/reveal`,{},true)).password,'fixture-secret');
 });
 await t.test('incomplete and changed-password messages require explicit review',async()=>{
  const result=await api('POST','/v1/mock/messages',{...message,externalMessageId:'incomplete',text:'user: REVIEW-A'});assert.equal(result.state,'REVIEW');
  const changed=await api('POST','/v1/mock/messages',{...message,externalMessageId:'changed',text:'name: Test\nuser: DEMO-A\npassword: conflicting'});assert.equal(changed.state,'REVIEW');
  const inbox=await api('GET','/v1/inbox');const review=inbox.find((x:any)=>x.id===result.id);
  await api('POST',`/v1/inbox/${review.id}/resolve`,{version:review.version,account:{namespace:'synthetic',username:'review-a',displayName:'Reviewed fixture'}},true);
  assert.equal((await api('GET','/v1/accounts')).length,3);
 });
 await t.test('optimistic concurrency and completed assignment never sends',async()=>{
  assignment=await api('PATCH',`/v1/assignments/${assignment.id}/status`,{version:assignment.version,status:'COMPLETED'});
  assert.equal((await app.inject({method:'PATCH',url:`/v1/assignments/${assignment.id}/status`,headers,payload:{version:1,status:'NEW'}})).statusCode,409);
  assert.equal((await api('GET','/v1/reply-jobs')).length,0);
 });
 await t.test('quoted reply approval is scoped, short-lived, single-use and idempotent',async()=>{
  template=await api('POST','/v1/reply-templates',{code:'done',body:'تم {taskName} ✅'});
  const preview=await api('POST','/v1/reply-jobs/preview',{assignmentId:assignment.id,sourceMessageId:assignment.sources?.[0]?.id??(await api('GET','/v1/assignments')).find((a:any)=>a.id===assignment.id).sources[0].id,templateId:template.id});
  assert.equal(preview.sessionId,session.id);assert.equal(preview.groupId,group.id);
  job=await api('POST','/v1/reply-jobs/approve',{approvalToken:preview.approvalToken,idempotencyKey:'fixture-reply-1'},true);
  assert.equal((await app.inject({method:'POST',url:'/v1/reply-jobs/approve',headers:sensitive,payload:{approvalToken:preview.approvalToken,idempotencyKey:'fixture-reply-2'}})).statusCode,409);
  const transport=new MockTransport();await dispatchOne(pool,transport);await dispatchOne(pool,transport);assert.equal(transport.sent.length,1);assert.equal(transport.sent[0]!.sessionId,session.id);
  assert.equal((await api('GET','/v1/reply-jobs'))[0].status,'SENT');
 });
 await t.test('ambiguous send never retries and crash recovery becomes UNKNOWN_DELIVERY',async()=>{
  const source=(await api('GET','/v1/assignments')).find((a:any)=>a.id===assignment.id).sources[0].id;
  const preview=await api('POST','/v1/reply-jobs/preview',{assignmentId:assignment.id,sourceMessageId:source,templateId:template.id});
  const ambiguous=await api('POST','/v1/reply-jobs/approve',{approvalToken:preview.approvalToken,idempotencyKey:'ambiguous'},true);
  const broken=new MockTransport();broken.replyToMessage=async()=>{throw new Error('timeout');};await dispatchOne(pool,broken);assert.equal(await dispatchOne(pool,broken),null);
  assert.equal((await pool.query('SELECT status FROM reply_jobs WHERE id=$1',[ambiguous.id])).rows[0].status,'UNKNOWN_DELIVERY');
  await pool.query("UPDATE reply_jobs SET status='SENDING' WHERE id=$1",[job.id]);const stop=await startMockWorker(pool,new MockTransport());await stop();
  assert.equal((await pool.query('SELECT status FROM reply_jobs WHERE id=$1',[job.id])).rows[0].status,'UNKNOWN_DELIVERY');
 });
 await t.test('wrong credential claims require manual/authorized evidence',async()=>{
  assert.equal((await app.inject({method:'POST',url:'/v1/issue-flags',headers:sensitive,payload:{accountId:account.id,kind:'INVALID_ACCOUNT_CODE',evidenceKind:'UNVERIFIED'}})).statusCode,409);
  assert.equal((await api('POST','/v1/issue-flags',{accountId:account.id,kind:'UNVERIFIED_CREDENTIALS',evidenceKind:'UNVERIFIED'})).verified,false);
  assert.equal((await api('POST','/v1/issue-flags',{accountId:account.id,kind:'INVALID_ACCOUNT_PASSWORD',evidenceKind:'MANUAL'},true)).verified,true);
 });
 await t.test('purge blocks uncertain delivery, stale snapshot, wrong confirmation and unauthenticated requests',async()=>{
  let preview=await api('POST','/v1/deletions/preview',{ids:[account.id]});
  assert.equal((await app.inject({method:'POST',url:'/v1/deletions/confirm',headers,payload:{approvalToken:preview.approvalToken,confirmation:preview.confirmation}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/v1/deletions/confirm',headers:sensitive,payload:{approvalToken:preview.approvalToken,confirmation:'DELETE 99'}})).statusCode,409);
  assert.equal((await app.inject({method:'POST',url:'/v1/deletions/confirm',headers:sensitive,payload:{approvalToken:preview.approvalToken,confirmation:preview.confirmation}})).statusCode,409);
  await pool.query("UPDATE reply_jobs SET status='FAILED' WHERE status='UNKNOWN_DELIVERY'");
  await api('PATCH',`/v1/accounts/${account.id}`,{version:account.version,displayName:'Updated fixture'});
  assert.equal((await app.inject({method:'POST',url:'/v1/deletions/confirm',headers:sensitive,payload:{approvalToken:preview.approvalToken,confirmation:preview.confirmation}})).statusCode,409);
  preview=await api('POST','/v1/deletions/preview',{ids:[account.id]});assert.equal((await api('POST','/v1/deletions/confirm',{approvalToken:preview.approvalToken,confirmation:preview.confirmation},true)).deleted,1);
  assert.equal((await pool.query('SELECT count(*) FROM account_credentials')).rows[0].count,'0');
  assert.equal((await pool.query('SELECT count(*) FROM reply_jobs')).rows[0].count,'0');
 });
 await t.test('archive and restore preserve task records; all deletion uses concrete snapshot',async()=>{
  let a=(await api('GET','/v1/accounts'))[0];a=await api('POST',`/v1/accounts/${a.id}/archive`,{version:a.version});assert.ok(a.archived_at);
  a=await api('POST',`/v1/accounts/${a.id}/restore`,{version:a.version});assert.equal(a.archived_at,null);
  const preview=await api('POST','/v1/deletions/preview',{all:true});assert.equal((await api('POST','/v1/deletions/confirm',{approvalToken:preview.approvalToken,confirmation:preview.confirmation},true)).deleted,2);
 });
 await t.test('durable ordered changes survive client reconnection',async()=>{const first=await api('GET','/v1/changes?cursor=0');assert.ok(first.items.length>0);const second=await api('GET',`/v1/changes?cursor=${first.cursor}`);assert.equal(second.items.length,0);assert.equal((await api('GET','/v1/dashboard')).accounts,0);});
});
