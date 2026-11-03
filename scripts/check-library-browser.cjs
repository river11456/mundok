// Optional browser regression: start npm run dev -- --port 5183 first.
// Use an existing Playwright installation via PLAYWRIGHT_MODULE; no app dependency is needed.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
 const page=await browser.newPage({viewport:{width:1100,height:1000}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.LIBRARY_TEST_URL || 'http://127.0.0.1:5183');
 await page.evaluate(()=>{
  localStorage.clear();
  const docs=Array.from({length:12},(_,i)=>({id:`d${i}`,title:`文獻${i}`,sub:`문헌 ${i}`,levels:{sentence:[{id:`c${i}`,text:'天地玄黃',reading:'천지현황',meaning:'하늘과 땅'}]}}));
  localStorage.setItem('mundok-v3/docs',JSON.stringify(docs));
  localStorage.setItem('mundok-v3/collections',JSON.stringify([{id:'folder',name:'수업',docIds:['d10','d11']},{id:'child',name:'하위',parentId:'folder',docIds:[]}]));
  localStorage.setItem('mundok-v3/session',JSON.stringify({last:null,streak:{lastDate:'',count:0,todayCards:0}}));localStorage.setItem('mundok-v3/prefs',JSON.stringify({onboardingSeen:true,shelvesCollapsed:[]}));
 });
 await page.reload(); await page.locator('[data-library-doc="d0"]').waitFor();
 const ids=()=>page.locator('[data-library-doc]').evaluateAll(els=>els.map(e=>e.dataset.libraryDoc));
 async function drag(from,to,part=.5){
  await from.scrollIntoViewIfNeeded(); const a=await from.boundingBox();
  await page.mouse.move(a.x+a.width*.5,a.y+a.height*.5); await page.mouse.down();
  const b=await to.boundingBox();await page.mouse.move(b.x+b.width*part,b.y+b.height*.5,{steps:20});await page.mouse.up();await page.waitForTimeout(650);
 }
 await drag(page.locator('[data-library-doc="d2"] .cover'),page.locator('[data-library-doc="d0"]'),.1);
 assert.deepEqual((await ids()).slice(0,3),['d2','d0','d1']);assert.equal(await page.locator('.home').count(),1);
 await page.reload();await page.locator('.home').waitFor(); assert.equal((await ids())[0],'d2');
 console.log('PASS mouse reorder, no accidental open, reload');
 await drag(page.locator('[data-library-doc="d0"] .cover'),page.locator('[data-library-folder="folder"]'));
 assert(!(await ids()).includes('d0'));
 await page.locator('[data-library-folder="folder"]').click();await page.locator('[data-library-doc="d0"]').waitFor();
 assert.deepEqual(await ids(),['d10','d11','d0']);
 console.log('PASS move into folder');
 const a=await page.locator('[data-library-doc="d10"] .cover').boundingBox();
 await page.mouse.move(a.x+25,a.y+25);await page.mouse.down();await page.mouse.move(a.x+50,a.y+50);await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(650);
 assert.deepEqual(await ids(),['d10','d11','d0']);assert.equal(await page.locator('.breadcrumbs [aria-current]').innerText(),'수업');
 console.log('PASS Escape keeps folder and order');
 await drag(page.locator('[data-library-doc="d0"] .cover'),page.locator('[data-library-folder="child"]'));
 await page.locator('[data-library-folder="child"]').click();assert.deepEqual(await ids(),['d0']);
 await drag(page.locator('[data-library-doc="d0"] .cover'),page.locator('[data-library-folder=""]'));
 await page.locator('[data-library-folder=""]').click();assert.equal((await ids()).at(-1),'d0');
 console.log('PASS nested move and root breadcrumb extraction');
 const summary=page.locator('[data-library-doc="d2"] summary');await summary.focus();await page.keyboard.press('Enter');
 const later=page.locator('[data-library-doc="d2"] [data-action="library-later"]');await later.focus();await page.keyboard.press('Enter');
 assert.equal((await ids())[1],'d2');
 console.log('PASS keyboard reorder');
 await page.setViewportSize({width:1100,height:1400});
 await page.waitForTimeout(350);
 await drag(page.locator('[data-library-doc="d0"] .cover'),page.locator('[data-library-doc="d1"]'),.1);
 assert.equal((await ids())[0],'d0');
 console.log('PASS multirow reorder');
 const beforeRelease=await ids();
 const releaseBox=await page.locator('[data-library-doc="d0"] .cover').boundingBox();
 await page.evaluate(()=>document.addEventListener('pointerdown',e=>window.testPointerId=e.pointerId,{once:true}));
 await page.mouse.move(releaseBox.x+30,releaseBox.y+30);await page.mouse.down();await page.mouse.move(releaseBox.x+60,releaseBox.y+60);
 assert.equal(await page.locator('.library-drag-preview').count(),1);
 await page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointermove',{pointerId:window.testPointerId,pointerType:'mouse',buttons:0,bubbles:true})));
 assert.equal(await page.locator('.library-drag-preview').count(),0);
 await page.mouse.up();assert.deepEqual(await ids(),beforeRelease);await page.waitForTimeout(650);
 console.log('PASS missed pointerup cancels on released-button reentry');
 await page.evaluate(async()=>{
   const {moveLibraryDoc}=await import('/src/library-actions.ts');
   const oldSet=Storage.prototype.setItem;
   const collections=localStorage.getItem('mundok-v3/collections'), order=localStorage.getItem('mundok-v3/library-order');
   let failed=false;
   Storage.prototype.setItem=function(k,v){if(k==='mundok-v3/library-order'&&!failed){failed=true;throw new Error('injected failure');}return oldSet.call(this,k,v);};
   try {let threw=false;try{moveLibraryDoc('d0','folder');}catch{threw=true;}
     if(!threw||localStorage.getItem('mundok-v3/collections')!==collections||localStorage.getItem('mundok-v3/library-order')!==order)throw new Error('Partial library mutation survived rollback');
   }finally{Storage.prototype.setItem=oldSet;}
 });
 console.log('PASS UI storage action failure rolls back location and order');
 if(process.env.LIBRARY_SCREENSHOT) {await page.waitForTimeout(350);await page.screenshot({path:process.env.LIBRARY_SCREENSHOT,fullPage:true});}
 assert.deepEqual(errors,[]);
 await page.close();
 // Real browser touch event stream, with long-press and native-scroll cancellation.
 const touchPage=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await touchPage.goto(process.env.LIBRARY_TEST_URL || 'http://127.0.0.1:5183');
 await touchPage.evaluate(()=>{localStorage.setItem('mundok-v3/docs',JSON.stringify(Array.from({length:8},(_,i)=>({id:`t${i}`,title:`문헌${i}`,sub:'터치 검증',levels:{sentence:[]}}))));localStorage.setItem('mundok-v3/collections',JSON.stringify([{id:'f',name:'목적지',docIds:[]}]));localStorage.setItem('mundok-v3/session',JSON.stringify({last:null,streak:{lastDate:'',count:0,todayCards:0}}));localStorage.setItem('mundok-v3/prefs',JSON.stringify({onboardingSeen:true,shelvesCollapsed:[]}));});
 await touchPage.reload();await touchPage.locator('[data-library-doc="t0"]').waitFor();
 const client=await touchPage.context().newCDPSession(touchPage);
 const box=await touchPage.locator('[data-library-doc="t0"] .cover').boundingBox(), dest=await touchPage.locator('[data-library-folder="f"]').boundingBox();
 const pt={x:box.x+box.width/2,y:box.y+box.height/2};
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt]});await touchPage.waitForTimeout(360);
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:dest.x+dest.width/2,y:dest.y+dest.height/2}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touchPage.waitForTimeout(650);
 assert.equal(await touchPage.locator('[data-library-doc="t0"]').count(),0);
 console.log('PASS mobile held touch moves document');
 const box2=await touchPage.locator('[data-library-doc="t1"] .cover').boundingBox();
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box2.x+30,y:box2.y+120}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box2.x+30,y:box2.y+30}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touchPage.waitForTimeout(200);
 assert.equal(await touchPage.locator('.library-drag-preview').count(),0);
 assert(await touchPage.evaluate(()=>scrollY)>0);
 console.log('PASS mobile swipe scrolls instead of dragging');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
