// Seeds a local chain with demo roles and one complete batch.
// Hardhat node accounts: 0 admin, 1 farmer, 2 lab, 3 processor, 4 distributor, 5 retailer
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const file = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  const { address } = JSON.parse(fs.readFileSync(file, "utf8"));
  const trace = await hre.ethers.getContractAt("AyurTrace", address);
  const [admin, farmer, lab, processor, distributor, retailer] = await hre.ethers.getSigners();

  await (await trace.grantRole(farmer.address, 1)).wait();
  await (await trace.grantRole(lab.address, 2)).wait();
  await (await trace.grantRole(processor.address, 3)).wait();
  await (await trace.grantRole(distributor.address, 4)).wait();
  await (await trace.grantRole(retailer.address, 5)).wait();

  await (await trace.connect(farmer).createBatch(
    "Ashwagandha", "Withania somnifera", true, "Jodhpur, Rajasthan (26.2389,73.0243)", ""
  )).wait();
  await (await trace.connect(lab).recordLabTest(
    1, true, "Certified Ayurvedic Lab, Kolkata", "", "Heavy metals and pesticide residue within limits"
  )).wait();
  await (await trace.connect(processor).recordProcessing(
    1, "GMP Unit, Howrah", "", "Shade-dried and powdered, 40-mesh"
  )).wait();
  await (await trace.connect(distributor).recordDistribution(
    1, "Central Warehouse, Kolkata", "", "Stored below 25C, dry"
  )).wait();
  await (await trace.connect(retailer).recordRetail(
    1, "Ayur Store, Park Street", "", "Packed and shelved"
  )).wait();

  console.log("Seeded batch #1. Role accounts:");
  console.log(" admin      ", admin.address);
  console.log(" farmer     ", farmer.address);
  console.log(" lab        ", lab.address);
  console.log(" processor  ", processor.address);
  console.log(" distributor", distributor.address);
  console.log(" retailer   ", retailer.address);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
