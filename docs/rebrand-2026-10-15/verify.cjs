const { chromium } = require('/Users/pkarakala/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const root = __dirname;
const results = [];
const errors = [];
async function check(name, fn) {try {await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1260,height:1060},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);
  await page.waitForFunction(()=>!!window.GreekTiesDesign);
  const screens=await page.evaluate(()=>window.GreekTiesDesign.screens);
  for(const config of [{width:390,large:false},{width:440,large:false},{width:375,large:true}]){
    await page.selectOption('#viewport',String(config.width));
    await page.locator('#large').setChecked(config.large);
    for(const screen of screens){
      await page.evaluate(id=>window.GreekTiesDesign.go(id),screen.id);
      await page.waitForTimeout(30);
      await check(`${screen.id} / ${config.width}${config.large?' enlarged':''} / bounds and image`,async()=>{
        const problems=await page.evaluate(()=>{
          const phone=document.querySelector('#phone'),content=document.querySelector('#app-content');
          const issues=[];
          if(content.scrollWidth>content.clientWidth+1)issues.push('horizontal content overflow');
          if(phone.scrollWidth>phone.clientWidth+2)issues.push('horizontal phone overflow');
          if(content.clientHeight<150)issues.push('content viewport too short');
          for(const image of phone.querySelectorAll('img'))if(!image.complete||image.naturalWidth===0)issues.push('broken image');
          for(const node of phone.querySelectorAll('button,input,select,textarea')){
            if(node.getBoundingClientRect().width>0 && node.scrollWidth>node.clientWidth+3 && node.tagName==='BUTTON')issues.push('button overflow: '+node.textContent.trim());
          }
          return issues;
        });
        assert.deepEqual(problems,[]);
      });
      await page.locator('#phone').screenshot({path:path.join(root,'screenshots',`${screen.id}-${config.width}${config.large?'-large':''}.png`)});
    }
  }
  await page.selectOption('#viewport','390');await page.locator('#large').uncheck();
  const goto=async id=>page.evaluate(id=>window.GreekTiesDesign.go(id),id);
  const click=async action=>page.locator(`[data-action="${action}"]`).first().click();
  await check('No-cover fallback keeps event title and metadata',async()=>{await page.selectOption('#media','none');await goto('home');assert.equal(await page.locator('.event-card img').isVisible(),false);assert.match(await page.locator('.event-card').innerText(),/Back in Santa Barbara/);await page.locator('#phone').screenshot({path:path.join(root,'screenshots','home-no-cover-390.png')});await goto('event');await page.locator('#phone').screenshot({path:path.join(root,'screenshots','event-no-cover-390.png')});await page.selectOption('#media','photo');});
  await check('Calendar selected-day agenda excludes unrelated events',async()=>{await goto('calendar');await click('day:12');assert.equal(await page.locator('.event-card').count(),0);assert.match(await page.locator('#app-content').innerText(),/Chapter meeting/);await click('day:13');assert.match(await page.locator('#app-content').innerText(),/No chapter events/);});
  await check('Sign-up requires consent and reaches email verification',async()=>{await goto('signup');await page.locator('[name="password"]').fill('fictional-only');await page.locator('#signup-form [type="checkbox"]').check();await page.locator('#signup-form [type="submit"]').click();assert.equal(await page.evaluate(()=>window.GreekTiesDesign.getState().screen),'emailverify');});
  await check('Home membership count opens combined directory filter',async()=>{await goto('home');await click('members:Alumni');assert.equal(await page.evaluate(()=>window.GreekTiesDesign.getState().member),'Alumni');await click('mentor-filter');await page.locator('#people-search').fill('Jordan');assert.equal(await page.locator('#member-results .row').count(),1);});
  await check('Combined filters and clear',async()=>{await click('go:filters');await page.selectOption('[name="industry"]','Consulting');await page.locator('[name="city"]').fill('Nowhere');await page.locator('#filter-form [type="submit"]').click();assert.equal(await page.locator('#member-results .row').count(),0);await click('clear-filters');assert.equal(await page.locator('#member-results .row').count(),6);});
  await check('Inbox search and group/mentorship selection',async()=>{await goto('chats');await click('chattab:Mentorship');await page.locator('#chat-search').fill('Jordan');assert.equal(await page.locator('#thread-results .row').count(),1);});
  await check('RSVP cancel does not save; save updates count',async()=>{await goto('event');await click('rsvp');await click('rsvp-choice:maybe');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.GreekTiesDesign.getState().rsvp),'going');await click('rsvp');await click('rsvp-choice:maybe');await click('save-rsvp');assert.equal(await page.evaluate(()=>window.GreekTiesDesign.getState().rsvp),'maybe');assert.match(await page.locator('#app-dock').innerText(),/37 going/);await click('rsvp');await page.locator('#phone').screenshot({path:path.join(root,'screenshots','rsvp-sheet-390.png')});await click('close');});
  await check('Consent is off, explicit opt-in, then revoke',async()=>{await goto('privacy');assert.equal(await page.locator('[data-action="share-city"]').isDisabled(),true);await page.locator('#map-consent').check();await click('share-city');assert.equal(await page.evaluate(()=>window.GreekTiesDesign.getState().sharing),true);await click('stop-sharing');assert.equal(await page.evaluate(()=>window.GreekTiesDesign.getState().sharing),false);});
  await check('Draft form validation, review, edit and publish simulation',async()=>{await goto('create');await page.locator('summary').click();await page.locator('[name="end"]').fill('15:00');await page.locator('#event-form [type="submit"]').click();assert.match(await page.locator('#form-error').innerText(),/after/);await page.locator('[name="end"]').fill('18:00');await page.locator('[name="title"]').fill('Our chapter reunion');await page.locator('#event-form [type="submit"]').click();assert.match(await page.locator('#app-content').innerText(),/Our chapter reunion/);await click('go:create');assert.equal(await page.inputValue('[name="title"]'),'Our chapter reunion');await page.locator('#event-form [type="submit"]').click();await click('publish');assert.equal(await page.evaluate(()=>window.GreekTiesDesign.getState().screen),'event');});
  await check('Message send escapes markup and retains own timestamp',async()=>{await goto('mentorship');await page.locator('#message').fill('<img src=x onerror=alert(1)>');await page.locator('#message-form [type="submit"]').click();assert.equal(await page.locator('.message.own').last().locator('img').count(),0);assert.match(await page.locator('.message.own').last().innerText(),/9:41 AM/);});
  await check('Dialog keyboard focus trap and Escape',async()=>{await goto('event');await click('rsvp');const buttons=page.locator('#overlay button');await buttons.last().focus();await page.keyboard.press('Tab');assert.equal(await buttons.first().evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Escape');assert.equal(await page.locator('[role="dialog"]').count(),0);});
  await check('Invite context and approval remains pending',async()=>{await goto('invitation');await click('go:signin');await page.locator('[name="password"]').fill('fictional-only');await page.locator('#signin-form [type="submit"]').click();assert.match(await page.locator('#app-content').innerText(),/Sigma Phi Epsilon/);await page.locator('#essentials-form [type="submit"]').click();await click('check-status');assert.equal(await page.evaluate(()=>window.GreekTiesDesign.getState().screen),'pending');});
  await check('Mentorship request does not create accepted DM',async()=>{await goto('request');await page.locator('#mentorship-form [type="submit"]').click();assert.match(await page.locator('#app-content').innerText(),/pending/);});
  await check('Deletion remains unavailable',async()=>{await goto('settings');assert.equal(await page.locator('[data-action="deletion"]').isDisabled(),true);});
  for(const state of ['loading','empty','error','offline','denied']){
    await goto('events');await page.selectOption('#state',state);
    await page.locator('#phone').screenshot({path:path.join(root,'screenshots',`events-${state}-390.png`)});
    await check(`Recovery state ${state}`,async()=>{assert.equal(await page.locator('#app-dock button').count(),0);assert.equal(await page.locator('.event-card').count(),0);if(state==='denied')assert.match(await page.locator('#app-content').innerText(),/cleared/);});
  }
  await check('Small browser viewport has no document overflow',async()=>{await page.setViewportSize({width:375,height:1000});await goto('home');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);});
  await check('No JavaScript runtime exceptions',async()=>assert.deepEqual(errors,[]));
  const report={date:'2026-10-15',scope:'Offline design prototype only; not the React Native app',screens:screens.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results,errors};
  fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({screens:report.screens,passed:report.passed,failed:report.failed,failures:results.filter(x=>x.status==='FAIL')},null,2));
  await browser.close();
  if(report.failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
