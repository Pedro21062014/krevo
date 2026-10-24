// Run against `npm run dev`: node tests/video-import.mjs /path/to/sample.mp4
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const file = process.argv[2];
if (!file) throw new Error('Pass a small playable MP4 fixture.');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport:{width:1500,height:950}});
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173');
  await page.click('[data-action="new-blank"]');
  await page.click('[data-mk="create"]');
  const chooser = page.waitForEvent('filechooser');
  await page.click('[data-edit="add-video"]');
  await (await chooser).setFiles(file);
  await page.waitForSelector('#stage-inner .kf-el.video video', {timeout:20000});
  const stats = await page.evaluate(()=>{
    const videos=[...document.querySelectorAll('video')];
    const live=document.querySelector('#stage-inner .kf-el.video video');
    return {total:videos.length, paused:live.paused, auto:live.autoplay, preload:live.preload, poster:!!live.poster};
  });
  assert.deepEqual(stats, {total:1,paused:true,auto:false,preload:'none',poster:true});
  await page.click('[data-inspector="toggle-video"]');
  await page.waitForFunction(()=>!document.querySelector('#stage-inner video').paused);
  // Store repaint must retain the node and playing state.
  const repaint = await page.evaluate(async()=>{
    const {store}=await import('/src/store.ts');
    const before=document.querySelector('#stage-inner video');
    store.patch({zoom:store.state.zoom});
    return {same:before===document.querySelector('#stage-inner video'),playing:before.parentElement.classList.contains('playing')};
  });
  assert.deepEqual(repaint,{same:true,playing:true});
  await page.click('[data-inspector="toggle-video"]');
  await page.waitForFunction(()=>document.querySelector('#stage-inner video').paused);
  // Independent thumbnail render never creates a decoder, even without a poster.
  const thumbs=await page.evaluate(async()=>{
    const {renderThumb,renderThumbFill}=await import('/src/ui/render.ts');
    const {store}=await import('/src/store.ts');
    const a=renderThumb(store.page,56), b=renderThumbFill(store.page,480,300);
    return {videos:a.querySelectorAll('video').length+b.querySelectorAll('video').length,images:a.querySelectorAll('img').length};
  });
  assert.equal(thumbs.videos,0);
  assert.ok(thumbs.images>0);
  await page.click('[data-edit="home"]');
  await page.waitForFunction(()=>!document.querySelector('#stage-inner'));
  assert.equal(await page.locator('video').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: import, poster, no autoplay, decoder-free thumbnails, playback/pause, repaint, editor cleanup.');
} finally {await browser.close();}
