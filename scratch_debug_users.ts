import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: { role: true }
  });
  console.log("=== USERS IN DATABASE ===");
  console.log(JSON.stringify(users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role.roleCode,
    ownerId: u.ownerId
  })), null, 2));

  const owners = await prisma.owner.findMany();
  console.log("=== OWNERS IN DATABASE ===");
  console.log(JSON.stringify(owners.map(o => ({
    id: o.id,
    ownerName: o.ownerName,
    userId: o.userId,
    email: o.email
  })), null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
