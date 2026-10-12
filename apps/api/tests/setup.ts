import { afterAll, beforeAll } from 'vitest';
import { cols, disconnectMongo, findMany } from '../src/db/mongo';
import type { OrganizationDoc } from '../src/domain/documents';
import { deleteTenant } from '../src/lib/tenant-cleanup';

beforeAll(async () => {
  const organizations = await findMany<OrganizationDoc>(cols.organizations, { slug: { $regex: '^test-' } });
  for (const organization of organizations) {
    await deleteTenant(organization.id);
  }
});

afterAll(async () => {
  await disconnectMongo();
});
