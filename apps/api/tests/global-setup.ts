import fs from 'node:fs';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const uriFile = path.resolve(process.cwd(), 'tests/.mongo-uri');
let replSet: MongoMemoryReplSet;

export async function setup(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const uri = replSet.getUri('invorra');
  process.env.MONGODB_URI = uri;
  fs.writeFileSync(uriFile, uri);
}

export async function teardown(): Promise<void> {
  fs.rmSync(uriFile, { force: true });
  if (replSet) {
    await replSet.stop();
  }
}
