import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Starting database repair for owners...");

  // 1. Find Leo and Master in users table
  const leo = await prisma.user.findFirst({
    where: { email: "owner@gmail.com" },
    include: { role: true }
  });
  const master = await prisma.user.findFirst({
    where: { email: "kumaran@gmail.com" },
    include: { role: true }
  });

  if (!leo) {
    console.log("User 'Leo' (owner@gmail.com) not found in database.");
  }
  if (!master) {
    console.log("User 'Master' (kumaran@gmail.com) not found in database.");
  }

  // 2. Link Leo (User ID 9) to Owner ID 1 (Primary Owner Corp)
  if (leo) {
    const owner1 = await prisma.owner.findUnique({ where: { id: 1 } });
    if (owner1) {
      await prisma.owner.update({
        where: { id: 1 },
        data: {
          userId: leo.id,
          ownerName: "Leo",
          email: leo.email,
          mobile: leo.mobile
        }
      });
      console.log(`Successfully updated Owner ID 1 to match user Leo (ID: ${leo.id}).`);
    } else {
      console.log("Owner ID 1 not found. Creating it for Leo...");
      await prisma.owner.create({
        data: {
          id: 1,
          userId: leo.id,
          ownerCode: "OWN-LEO",
          ownerName: "Leo",
          email: leo.email,
          mobile: leo.mobile,
          address: "Default Address",
          village: "Default Village",
          district: "Default District",
          state: "Default State",
          pincode: "000000",
          aadhaarNumber: "000000000000",
          bankName: "Default Bank",
          accountNumber: "000000000000",
          ifscCode: "IFSC0000000"
        }
      });
      console.log("Created Owner ID 1 for Leo.");
    }
  }

  // 3. Link/Create Owner record for Master (User ID 10)
  let masterOwnerId: number | null = null;
  if (master) {
    let masterOwner = await prisma.owner.findFirst({
      where: { userId: master.id }
    });

    if (!masterOwner) {
      // Check if an owner with email already exists (could be duplicate)
      masterOwner = await prisma.owner.findFirst({
        where: { email: master.email }
      });
    }

    if (masterOwner) {
      await prisma.owner.update({
        where: { id: masterOwner.id },
        data: {
          userId: master.id,
          ownerName: "Master",
          email: master.email,
          mobile: master.mobile
        }
      });
      masterOwnerId = masterOwner.id;
      console.log(`Successfully updated existing Owner record (ID: ${masterOwner.id}) for user Master.`);
    } else {
      const newOwner = await prisma.owner.create({
        data: {
          userId: master.id,
          ownerCode: "OWN-MASTER",
          ownerName: "Master",
          email: master.email,
          mobile: master.mobile,
          address: "Default Address",
          village: "Default Village",
          district: "Default District",
          state: "Default State",
          pincode: "000000",
          aadhaarNumber: "000000000000",
          bankName: "Default Bank",
          accountNumber: "000000000000",
          ifscCode: "IFSC0000000"
        }
      });
      masterOwnerId = newOwner.id;
      console.log(`Successfully created new Owner record (ID: ${newOwner.id}) for user Master.`);
    }
  }

  // 4. Update 'master operator' (User ID 11) to be under Master's Owner ID
  const masterOperator = await prisma.user.findFirst({
    where: { email: "masteroperator@gmail.com" }
  });

  if (masterOperator && masterOwnerId) {
    // Update users table
    await prisma.user.update({
      where: { id: masterOperator.id },
      data: { ownerId: masterOwnerId }
    });
    console.log(`Updated user 'master operator' (ID: ${masterOperator.id}) to have ownerId: ${masterOwnerId}.`);

    // Update operators table if exists
    const operatorRecord = await prisma.operator.findFirst({
      where: {
        OR: [
          { userId: masterOperator.id },
          { mobile: masterOperator.mobile }
        ]
      }
    });

    if (operatorRecord) {
      await prisma.operator.update({
        where: { id: operatorRecord.id },
        data: { ownerId: masterOwnerId }
      });
      console.log(`Updated operator record 'master operator' (ID: ${operatorRecord.id}) to have ownerId: ${masterOwnerId}.`);
    }
  }

  console.log("Database repair successfully completed.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
