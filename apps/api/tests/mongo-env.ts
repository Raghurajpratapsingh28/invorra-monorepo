import fs from 'node:fs';
import path from 'node:path';

const uriFile = path.resolve(process.cwd(), 'tests/.mongo-uri');
if (!process.env.MONGODB_URI?.startsWith('mongodb')) {
  process.env.MONGODB_URI = fs.readFileSync(uriFile, 'utf8').trim();
}
