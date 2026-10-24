// Run against `npm run dev`: node tests/video-import.mjs [playable-sample.mp4]
// The default test deliberately makes the media backend unavailable. Import
// must still work, including corrupt/unsupported files and all thumbnail paths.
import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
const engine = process.env.TEST_BROWSER === 'webkit' ? webkit : chromium;
const url = process.env.TEST_URL || 'http://127.0.0.1:5173';
const deadline = Date.now() + 30000;
while (true) {
  try { if ((await fetch(url)).ok) break; } catch {}
  if (Date.now() > deadline) throw new Error('Dev server did not become ready');
  await new Promise(resolve => setTimeout(resolve, 250));
}
const browser = await engine.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {});
try {
  const page = await browser.newPage({viewport:{width:1500,height:950}});
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto(url);
  await page.click('[data-action="new-blank"]');
  await page.click('[data-mk="create"]');
  await page.evaluate(()=>{
    window.__videoCreations=0;
    const original=document.createElement.bind(document);
    window.__restoreVideoCreation=()=>{document.createElement=original;};
    document.createElement=function(tag,...args){
      if(String(tag).toLowerCase()==='video') {
        window.__videoCreations++;
        throw new Error('Decoder forbidden during import');
      }
      return original(tag,...args);
    };
  });
  const importFile=async(file)=>{
    const chooser=page.waitForEvent('filechooser');
    await page.click('[data-edit="add-video"]');
    await (await chooser).setFiles(file);
  };
  await importFile(process.argv[2] || {name:'unsupported.mp4',mimeType:'video/mp4',buffer:Buffer.from('Invalid codec data')});
  await page.waitForSelector('#stage-inner .kf-el.video .video-placeholder');
  assert.equal(await page.locator('video').count(),0);
  const thumbs=await page.evaluate(async()=>{
    const {renderThumb,renderThumbFill}=await import('/src/ui/render.ts');
    const {store}=await import('/src/store.ts');
    const a=renderThumb(store.page,56), b=renderThumbFill(store.page,480,300);
    for(let i=0;i<10;i++) store.patch({zoom:store.state.zoom});
    const el=store.page.elements.find(el=>el.kind==='video');
    // MIME-less files from some Linux file pickers must be accepted too.
    const {EditorView}=await import('/src/ui/editor.ts');
    const file=new File(['not a valid mkv'],'no-mime.mkv',{type:''});
    // Access TS-private method for regression of the actual import pipeline.
    await EditorView.prototype.importMedia.call({},file);
    return {videos:a.querySelectorAll('video').length+b.querySelectorAll('video').length,
      cards:a.querySelectorAll('.video-placeholder').length+b.querySelectorAll('.video-placeholder').length,
      src:el.src,poster:el.poster, creations:window.__videoCreations,
      count:store.page.elements.filter(el=>el.kind==='video').length};
  });
  assert.equal(thumbs.videos,0);
  assert.equal(thumbs.cards,2);
  assert.equal(thumbs.creations,0);
  assert.equal(thumbs.count,2);
  assert.ok(thumbs.src.startsWith('blob:'));
  assert.ok(!thumbs.poster);
  await page.evaluate(()=>window.__restoreVideoCreation());
  if(process.argv[2]) {
    // Select the first (valid) video and explicitly request playback.
    await page.evaluate(async()=>{
      const {store}=await import('/src/store.ts');
      store.select([store.page.elements.find(el=>el.kind==='video').id]);
    });
    await page.click('[data-inspector="toggle-video"]');
    await page.waitForFunction(()=>document.querySelector('#stage-inner video')?.paused===false);
    assert.equal(await page.locator('video').count(),1);
    const repaint=await page.evaluate(async()=>{
      const {store}=await import('/src/store.ts');
      const before=document.querySelector('#stage-inner video');
      store.patch({zoom:store.state.zoom});
      return {same:before===document.querySelector('#stage-inner video'),playing:before.parentElement.classList.contains('playing')};
    });
    assert.deepEqual(repaint,{same:true,playing:true});
    await page.click('[data-inspector="toggle-video"]');
    await page.waitForFunction(()=>document.querySelector('#stage-inner video').paused);
  }
  await page.click('[data-edit="home"]');
  await page.waitForFunction(()=>!document.querySelector('#stage-inner'));
  assert.equal(await page.locator('video').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: import with media backend blocked, zero video creation/source assignment, corrupt/MIME-less files, repaint and thumbnails; optional explicit playback and cleanup.');
} finally {await browser.close();}
