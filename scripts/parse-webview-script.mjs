import fs from 'node:fs';

const p = 'd:/AISpace/Apps/NaughtAgent/packages/vscode/src/views/chat/ChatViewProvider.ts';
const s = fs.readFileSync(p, 'utf8');
const start = s.indexOf('<script nonce="${nonce}">');
const end = s.indexOf('</script>', start);
if (start < 0 || end < 0) {
  console.error('script block not found');
  process.exit(1);
}
const content = s.slice(start + '<script nonce="${nonce}">'.length, end);
try {
  // Parse only
  // eslint-disable-next-line no-new-func
  new Function(content);
  console.log('script-parse-ok');
} catch (e) {
  console.error('script-parse-error:', e instanceof Error ? e.message : String(e));
  process.exit(2);
}
