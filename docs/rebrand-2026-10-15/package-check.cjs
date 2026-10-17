const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require('/Users/pkarakala/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=__dirname;
const results=[];
function record(name,ok,detail){results.push({name,status:ok?'PASS':'FAIL',detail});}
function luminance(hex){const x=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*x[0]+.7152*x[1]+.0722*x[2];}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
(async()=>{
  const tokens=JSON.parse(fs.readFileSync(path.join(root,'tokens.json'),'utf8')).color;
  for(const [fg,bg] of [['surface','blue'],['navy','gold'],['navy','goldLight'],['muted','surface'],['muted','background'],['error','surface'],['success','surface']]){const ratio=contrast(tokens[fg],tokens[bg]);record(`${fg} on ${bg} >= 4.5:1`,ratio>=4.5,ratio.toFixed(2));}
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1200},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'GALLERY.html')).href);
  const sources=await page.locator('img').evaluateAll(images=>images.map(i=>i.getAttribute('src')));
  for(const src of sources)record(`Gallery image exists: ${src}`,fs.existsSync(path.join(root,src)));
  const links=await page.locator('a').evaluateAll(anchors=>anchors.map(a=>a.getAttribute('href')).filter(Boolean));
  for(const link of [...new Set(links)])record(`Local link exists: ${link}`,fs.existsSync(path.join(root,link.split('#')[0])));
  await page.locator('#overview img').evaluateAll(images=>images.forEach(i=>i.loading='eager'));
  await page.waitForFunction(()=>[...document.querySelectorAll('#overview img')].every(i=>i.complete&&i.naturalWidth>0));
  await page.locator('#overview').screenshot({path:path.join(root,'OVERVIEW.png')});
  await page.selectOption('#size','375-large');
  const enlarged=await page.locator('img').evaluateAll(images=>images.map(i=>i.getAttribute('src')));
  record('All enlarged gallery images exist',enlarged.every(src=>fs.existsSync(path.join(root,src))));
  await page.setViewportSize({width:375,height:900});
  record('Gallery mobile document has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  record('Gallery has no JavaScript exceptions',errors.length===0,errors);
  await browser.close();
  const files=[];
  function walk(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name);if(fs.statSync(p).isDirectory())walk(p);else if(!['manifest.json','package-check.json'].includes(name))files.push(p);}}
  walk(root);
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(files.map(p=>({path:path.relative(root,p),bytes:fs.statSync(p).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')})),null,2));
  const report={date:'2026-10-15',scope:'Design package only',passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};
  fs.writeFileSync(path.join(root,'package-check.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,failures:results.filter(r=>r.status==='FAIL'),files:files.length},null,2));
  if(report.failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
