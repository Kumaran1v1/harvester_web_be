import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Find first owner
  let owner = await prisma.owner.findFirst();
  if (!owner) {
    console.log("No owner found. Creating a default Owner user first...");
    let ownerUser = await prisma.user.findFirst({
      where: { role: { roleCode: "OWNER" } }
    });
    if (!ownerUser) {
      // Find role for owner
      const ownerRole = await prisma.role.findFirst({ where: { roleCode: "OWNER" } });
      if (!ownerRole) {
        throw new Error("OWNER role not found in database");
      }
      ownerUser = await prisma.user.create({
        data: {
          name: "Default Owner",
          email: "owner@gmail.com",
          mobile: "2222222222",
          password: "$2b$10$tZ/n0Z1hO4Y/JdG52fXg1On6mN6p3.9B2uG0/Vq6tN56zB/eN5D6O", // Admin@123 hashed
          roleId: ownerRole.id
        }
      });
    }
    owner = await prisma.owner.create({
      data: {
        userId: ownerUser.id,
        ownerCode: "OWN-001",
        ownerName: ownerUser.name,
        email: ownerUser.email,
        mobile: ownerUser.mobile,
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
  }

  const ownerId = owner.id;
  console.log(`Using Owner ID: ${ownerId} (${owner.ownerName}) for data migration.`);

  // Update Users where ownerId is null and role is not SUPER_ADMIN / OWNER
  const updatedUsers = await prisma.user.updateMany({
    where: {
      ownerId: null,
      role: {
        roleCode: { notIn: ["SUPER_ADMIN", "OWNER"] }
      }
    },
    data: { ownerId }
  });
  console.log(`Updated ${updatedUsers.count} users with default ownerId.`);

  // Update Farmers
  const updatedFarmers = await prisma.farmer.updateMany({
    where: { ownerId: null },
    data: { ownerId }
  });
  console.log(`Updated ${updatedFarmers.count} farmers with default ownerId.`);

  // Update Operators
  const updatedOperators = await prisma.operator.updateMany({
    where: { ownerId: null },
    data: { ownerId }
  });
  console.log(`Updated ${updatedOperators.count} operators with default ownerId.`);

  // Update Labors
  const updatedLabors = await prisma.labor.updateMany({
    where: { ownerId: null },
    data: { ownerId }
  });
  console.log(`Updated ${updatedLabors.count} labors with default ownerId.`);

  // Update Bookings
  const updatedBookings = await prisma.booking.updateMany({
    where: { ownerId: null },
    data: { ownerId }
  });
  console.log(`Updated ${updatedBookings.count} bookings with default ownerId.`);

  // Update FuelLogs
  const updatedFuelLogs = await prisma.fuelLog.updateMany({
    where: { ownerId: null },
    data: { ownerId }
  });
  console.log(`Updated ${updatedFuelLogs.count} fuel logs with default ownerId.`);

  // Update MaintenanceLogs
  const updatedMaintenanceLogs = await prisma.maintenanceLog.updateMany({
    where: { ownerId: null },
    data: { ownerId }
  });
  console.log(`Updated ${updatedMaintenanceLogs.count} maintenance logs with default ownerId.`);

  // Update Expenses
  const updatedExpenses = await prisma.expense.updateMany({
    where: { ownerId: null },
    data: { ownerId }
  });
  console.log(`Updated ${updatedExpenses.count} expenses with default ownerId.`);

  // Update Incomes
  const updatedIncomes = await prisma.income.updateMany({
    where: { ownerId: null },
    data: { ownerId }
  });
  console.log(`Updated ${updatedIncomes.count} incomes with default ownerId.`);

  // Update Invoices
  const updatedInvoices = await prisma.invoice.updateMany({
    where: { ownerId: null },
    data: { ownerId }
  });
  console.log(`Updated ${updatedInvoices.count} invoices with default ownerId.`);

  // Update Payments
  const updatedPayments = await prisma.payment.updateMany({
    where: { ownerId: null },
    data: { ownerId }
  });
  console.log(`Updated ${updatedPayments.count} payments with default ownerId.`);

  console.log("Data migration successfully completed.");
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
