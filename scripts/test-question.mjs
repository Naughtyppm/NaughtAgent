/**
 * WS 测试脚本：测试 question 工具是否正确通过 WS 发送 question_request
 * 用法: node scripts/test-question.mjs
 */
import http from 'node:http';
import crypto from 'node:crypto';

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: parsed.hostname, port: parsed.port,
      path: parsed.pathname + parsed.search, method: 'GET',
      headers: { 'Upgrade': 'websocket', 'Connection': 'Upgrade', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' },
    });
    req.on('upgrade', (res, socket) => {
      let buf = Buffer.alloc(0);
      const ws = {
        send(data) {
          const p = Buffer.from(data, 'utf-8');
          const mask = crypto.randomBytes(4);
          let h;
          if (p.length < 126) { h = Buffer.alloc(6); h[0]=0x81; h[1]=0x80|p.length; mask.copy(h,2); }
          else { h = Buffer.alloc(8); h[0]=0x81; h[1]=0x80|126; h.writeUInt16BE(p.length,2); mask.copy(h,4); }
          const m = Buffer.alloc(p.length);
          for(let i=0;i<p.length;i++) m[i]=p[i]^mask[i%4];
          socket.write(Buffer.concat([h,m]));
        },
        close() { socket.end(); },
        onmessage: null, onclose: null,
      };
      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 2) {
          let pLen = buf[1] & 0x7f, off = 2;
          if (pLen === 126) { if(buf.length<4) return; pLen = buf.readUInt16BE(2); off=4; }
          else if (pLen === 127) { if(buf.length<10) return; pLen = Number(buf.readBigUInt64BE(2)); off=10; }
          if (buf.length < off + pLen) return;
          const payload = buf.subarray(off, off + pLen);
          const opcode = buf[0] & 0x0f;
          buf = buf.subarray(off + pLen);
          if (opcode === 0x01 && ws.onmessage) ws.onmessage(payload.toString('utf-8'));
          else if (opcode === 0x08) { if(ws.onclose) ws.onclose(); socket.end(); }
        }
      });
      socket.on('close', () => { if(ws.onclose) ws.onclose(); });
      resolve(ws);
    });
    req.on('error', reject);
    req.end();
  });
}

const WS_URL = 'ws://127.0.0.1:31415/ws?cwd=' + encodeURIComponent(process.cwd());
const ws = await connectWs(WS_URL);
console.log('[test] WS connected');

ws.send(JSON.stringify({
  type: 'send',
  message: '请使用 question 工具问我一个 confirm 类型的问题。直接调用 question 工具，type 设为 confirm，message 设为"你喜欢猫吗？"。不要做任何其他事情。',
  model: 'opus-4.5',
}));
console.log('[test] Message sent, waiting for events...');

ws.onmessage = (data) => {
  const msg = JSON.parse(data);
  const preview = JSON.stringify(msg).slice(0, 300);
  console.log(`[test] << ${msg.type}: ${preview}`);
  
  if (msg.type === 'question_request') {
    console.log('\n[test] ✅ GOT question_request!');
    setTimeout(() => {
      ws.send(JSON.stringify({ type: 'question_response', requestId: msg.requestId, value: true }));
      console.log('[test] Sent question_response (Yes)');
    }, 500);
  }
  
  if (msg.type === 'done') {
    console.log('\n[test] ✅ Done!');
    setTimeout(() => { ws.close(); process.exit(0); }, 2000);
  }
};

ws.onclose = () => console.log('[test] WS closed');
setTimeout(() => { console.log('[test] ⏰ Timeout!'); ws.close(); process.exit(1); }, 120000);
