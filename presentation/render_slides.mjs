// 把 16 页幻灯片逐页渲染为高清 PNG（用于导出 pptx）。
// 依赖：headless Chrome --remote-debugging-port=9222；幻灯片在 DECK_URL。
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DECK_URL = process.env.DECK_URL || 'http://localhost:8099/index.html';
const OUT = fileURLToPath(new URL('./assets/slides/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const targets = await (await fetch('http://localhost:9222/json')).json();
const page = targets.find(t => t.type === 'page') || targets[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));

let _id = 0;
const pending = new Map();
const waiters = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  } else if (m.method) {
    for (let i = waiters.length - 1; i >= 0; i--)
      if (waiters[i].method === m.method) { waiters[i].resolve(m.params); waiters.splice(i, 1); }
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++_id; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)); } }, 25000);
});
const waitEvent = method => new Promise(resolve => waiters.push({ method, resolve }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evaluate = expr => send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  .then(r => r.result.value);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false });

await send('Page.navigate', { url: DECK_URL });
await waitEvent('Page.loadEventFired');
await sleep(1500);

const count = await evaluate('document.querySelectorAll(".slide").length');
console.log('slides:', count);

for (let i = 0; i < count; i++) {
  await evaluate(`window.show(${i})`);
  await sleep(700); // 等待入场动画与水波稳定
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const name = 'slide-' + String(i + 1).padStart(2, '0') + '.png';
  writeFileSync(OUT + name, Buffer.from(data, 'base64'));
  console.log('saved', name);
}

ws.close();
console.log('done ->', OUT);
process.exit(0);
