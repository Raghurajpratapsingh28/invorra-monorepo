import { afterAll, beforeAll } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { deleteTenant } from '../src/lib/tenant-cleanup';

beforeAll(async () => {
  const organizations = await prisma.organization.findMany({
    where: { slug: { startsWith: 'test-' } },
    select: { id: true },
  });
  for (const organization of organizations) {
    await deleteTenant(organization.id);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
