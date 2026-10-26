/**
 * scripts/reset-db.js — apaga o banco SQLite; o servidor recria as tabelas
 * e os dados de demonstração na próxima vez que iniciar.
 * Uso: npm run db:reset
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arquivo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/pulso.sqlite');

for (const sufixo of ['', '-wal', '-shm', '-journal']) {
  if (fs.existsSync(arquivo + sufixo)) fs.rmSync(arquivo + sufixo);
}
console.log('Banco removido. Rode "npm start" para recriar com os dados de exemplo.');
