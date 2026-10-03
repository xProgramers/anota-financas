// Permite rodar os testes com `node --experimental-strip-types` mapeando imports .js → .ts
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && spec.endsWith('.js') && ctx.parentURL) {
    const ts = new URL(spec.replace(/\\.js$/, '.ts'), ctx.parentURL);
    if (existsSync(fileURLToPath(ts))) return next(ts.href, ctx);
  }
  return next(spec, ctx);
}`));
