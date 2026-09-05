// 零依赖 CDP 截图脚本：驱动真实程序，分区域截图存 PNG。
// 依赖：已运行 headless Chrome --remote-debugging-port=9222，程序在 APP_URL。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP_URL = process.env.APP_URL || 'http://localhost:5180/';
const OUT = fileURLToPath(new URL('./assets/screenshots/', import.meta.url));
const SCALE = 2;

// —— 极简 CDP 客户端 ——
const ver = await (await fetch('http://localhost:9222/json')).json();
const page = ver.find(t => t.type === 'page') || ver[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));

let _id = 0;
const pending = new Map();
const waiters = [];
ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method) {
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].method === msg.method) { waiters[i].resolve(msg.params); waiters.splice(i, 1); }
    }
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++_id; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)); } }, 20000);
});
const waitEvent = method => new Promise(resolve => waiters.push({ method, resolve }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evaluate = async expr => (await send('Runtime.evaluate',
  { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

function validClip(c) {
  if (!c || !(c.width > 40) || !(c.height > 40)) return null;
  return { x: Math.max(0, c.x), y: Math.max(0, c.y),
           width: Math.min(c.width, 4000), height: Math.min(c.height, 4000) };
}
async function shot(name, clip, beyond = true) {
  try {
    const c = validClip(clip);
    const params = { format: 'png', captureBeyondViewport: beyond && !!c };
    if (c) params.clip = { ...c, scale: SCALE };
    const { data } = await send('Page.captureScreenshot', params);
    writeFileSync(OUT + name, Buffer.from(data, 'base64'));
    console.log('saved', name, c ? `${Math.round(c.width)}x${Math.round(c.height)}` : 'viewport');
  } catch (e) {
    console.log('FAILED', name, e.message);
  }
}

// 把含指定文本的最深层元素滚动到视口中央
const scrollToText = (text) => `(() => {
  const all = [...document.querySelectorAll('button,h1,h2,h3,h4,label,div,section')];
  const matches = all.filter(e => e.textContent.includes(${JSON.stringify(text)}));
  const el = matches.sort((a,b)=>a.textContent.length-b.textContent.length)[0];
  if (!el) return false;
  el.scrollIntoView({ block: 'center', inline: 'center' });
  return true;
})()`;
// 截取整个视口（受 1440x900 限制，避免超大图卡死）
async function viewShot(name) {
  await shot(name, null, false);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',
  { width: 1440, height: 900, deviceScaleFactor: SCALE, mobile: false });

// 1) 打开程序
await send('Page.navigate', { url: APP_URL });
await waitEvent('Page.loadEventFired');
await sleep(2500);

// 2) 加载一个有污染与投药的场景（第一个 select = 场景选择器）
await evaluate(`(() => {
  const sel = document.querySelector('select');
  if (!sel || sel.options.length < 3) return 'no-select';
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, sel.options[2].value);          // 温带高富营养化赤潮：高浊度、有催化投放
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return sel.options[2].textContent;
})()`).then(t => console.log('scenario:', t));
await sleep(2800);

const canvasCardRect = (i) => `(() => {
  const cs = [...document.querySelectorAll('canvas')];
  const c = ${i} < 0 ? cs[cs.length-1] : cs[${i}];
  if (!c) return null;
  const card = c.closest('section, .glass, [class*="card"], [class*="panel"]') || c;
  const r = card.getBoundingClientRect();
  return { x: r.x-8, y: r.y-44, width: r.width+16, height: r.height+56 };
})()`;

// 3) river.png —— 河道观察窗（第 1 个 canvas 卡片，紧凑裁剪）
await evaluate('window.scrollTo(0,0)'); await sleep(300);
const riverRect = await evaluate(canvasCardRect(0)).catch(() => null);
console.log('riverRect', JSON.stringify(riverRect));
await shot('river.png', riverRect);

// 4) dosing.png —— 滚到左侧参数/投药面板，截视口
await evaluate(scrollToText('精确段数')).catch(() => null);
await sleep(500);
await viewShot('dosing.png');

// 5) standard.png —— 滚到底部达标信号 + 优化控件，截视口
await evaluate(scrollToText('自动优化投药策略')).catch(() => null);
await sleep(500);
await viewShot('standard.png');

// 6) chart.png —— 浓度沿程衰减曲线图表（第二个可见 canvas）
// 该图表加载场景后即存在，无需点击"自动优化"（优化是重计算，会阻塞主线程），
// 因此沿用可靠的视口截图路径，把图表滚到中央后截屏。
await evaluate(`(() => {
  const cs = [...document.querySelectorAll('canvas')];
  const chart = cs.find((c, i) => i > 0 && c.offsetParent !== null && c.width > 300) || cs[cs.length - 1];
  if (chart) chart.scrollIntoView({ block: 'center', inline: 'center' });
  return chart ? { w: chart.width, h: chart.height } : null;
})()`).then(v => console.log('chartCanvas', JSON.stringify(v))).catch(() => null);
await sleep(700);
await viewShot('chart.png');

ws.close();
console.log('done -> ', OUT);
process.exit(0);
