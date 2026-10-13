const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// Role enum: None=0, Farmer=1, Lab=2, Processor=3, Distributor=4, Retailer=5
// Stage enum: Harvested=0, LabTested=1, Processed=2, Distributed=3, Retail=4
const Role = { None: 0, Farmer: 1, Lab: 2, Processor: 3, Distributor: 4, Retailer: 5 };
const Stage = { Harvested: 0, LabTested: 1, Processed: 2, Distributed: 3, Retail: 4 };

describe("AyurTrace", function () {
  async function deploy() {
    const [admin, farmer, lab, processor, distributor, retailer, stranger] =
      await ethers.getSigners();
    const trace = await (await ethers.getContractFactory("AyurTrace")).deploy();
    await trace.grantRole(farmer.address, Role.Farmer);
    await trace.grantRole(lab.address, Role.Lab);
    await trace.grantRole(processor.address, Role.Processor);
    await trace.grantRole(distributor.address, Role.Distributor);
    await trace.grantRole(retailer.address, Role.Retailer);
    return { trace, admin, farmer, lab, processor, distributor, retailer, stranger };
  }

  async function withBatch() {
    const ctx = await deploy();
    await ctx.trace
      .connect(ctx.farmer)
      .createBatch("Ashwagandha", "Withania somnifera", true, "Jodhpur, Rajasthan", "QmFarmPhoto");
    return ctx;
  }

  it("sets deployer as admin and only admin can grant roles", async () => {
    const { trace, admin, stranger } = await loadFixture(deploy);
    expect(await trace.admin()).to.equal(admin.address);
    await expect(
      trace.connect(stranger).grantRole(stranger.address, Role.Farmer)
    ).to.be.revertedWith("Not admin");
  });

  it("lets admin revoke a role", async () => {
    const { trace, farmer } = await loadFixture(deploy);
    await trace.grantRole(farmer.address, Role.None);
    await expect(
      trace.connect(farmer).createBatch("Tulsi", "Ocimum sanctum", false, "x", "y")
    ).to.be.revertedWith("Wrong role");
  });

  it("farmer creates a batch with a Harvested step", async () => {
    const { trace, farmer } = await loadFixture(withBatch);
    const b = await trace.getBatch(1);
    expect(b.herbName).to.equal("Ashwagandha");
    expect(b.farmer).to.equal(farmer.address);
    expect(b.organicCertified).to.equal(true);
    expect(b.currentStage).to.equal(Stage.Harvested);
    const h = await trace.getHistory(1);
    expect(h.length).to.equal(1);
    expect(h[0].evidenceHash).to.equal("QmFarmPhoto");
  });

  it("rejects batch creation by non-farmers and empty herb names", async () => {
    const { trace, lab, farmer } = await loadFixture(deploy);
    await expect(
      trace.connect(lab).createBatch("Tulsi", "", false, "x", "y")
    ).to.be.revertedWith("Wrong role");
    await expect(
      trace.connect(farmer).createBatch("", "", false, "x", "y")
    ).to.be.revertedWith("Herb name required");
  });

  it("runs the full happy path through all five stages", async () => {
    const { trace, lab, processor, distributor, retailer } = await loadFixture(withBatch);
    await trace.connect(lab).recordLabTest(1, true, "Lab, Kolkata", "QmLabReport", "Pure");
    await trace.connect(processor).recordProcessing(1, "Unit, Howrah", "QmProc", "Dried, powdered");
    await trace.connect(distributor).recordDistribution(1, "Warehouse", "QmDist", "Cold chain");
    await trace.connect(retailer).recordRetail(1, "Shop, Kolkata", "QmShop", "On shelf");

    const b = await trace.getBatch(1);
    expect(b.currentStage).to.equal(Stage.Retail);
    expect(b.labPassed).to.equal(true);

    const h = await trace.getHistory(1);
    expect(h.length).to.equal(5);
    expect(h.map((s) => Number(s.stage))).to.deep.equal([0, 1, 2, 3, 4]);
  });

  it("enforces stage order", async () => {
    const { trace, lab, processor, distributor, retailer } = await loadFixture(withBatch);
    await expect(
      trace.connect(distributor).recordDistribution(1, "w", "h", "n")
    ).to.be.revertedWith("Bad stage");
    await expect(
      trace.connect(retailer).recordRetail(1, "s", "h", "n")
    ).to.be.revertedWith("Bad stage");
    await expect(
      trace.connect(processor).recordProcessing(1, "p", "h", "n")
    ).to.be.revertedWith("Lab test not passed");

    await trace.connect(lab).recordLabTest(1, true, "l", "h", "n");
    // lab cannot test twice
    await expect(
      trace.connect(lab).recordLabTest(1, true, "l", "h", "n")
    ).to.be.revertedWith("Bad stage");
  });

  it("blocks processing when the lab test fails", async () => {
    const { trace, lab, processor } = await loadFixture(withBatch);
    await trace.connect(lab).recordLabTest(1, false, "Lab", "QmFail", "Heavy metals above limit");
    expect((await trace.getBatch(1)).labPassed).to.equal(false);
    await expect(
      trace.connect(processor).recordProcessing(1, "p", "h", "n")
    ).to.be.revertedWith("Lab test not passed");
  });

  it("rejects actors with the wrong role", async () => {
    const { trace, stranger, farmer } = await loadFixture(withBatch);
    await expect(
      trace.connect(stranger).recordLabTest(1, true, "l", "h", "n")
    ).to.be.revertedWith("Wrong role");
    await expect(
      trace.connect(farmer).recordLabTest(1, true, "l", "h", "n")
    ).to.be.revertedWith("Wrong role");
  });

  it("reverts for unknown batches", async () => {
    const { trace, lab } = await loadFixture(deploy);
    await expect(trace.getBatch(99)).to.be.revertedWith("No such batch");
    await expect(trace.getHistory(99)).to.be.revertedWith("No such batch");
    await expect(
      trace.connect(lab).recordLabTest(99, true, "l", "h", "n")
    ).to.be.revertedWith("No such batch");
  });

  it("recall freezes the batch and only admin can recall", async () => {
    const { trace, lab, stranger } = await loadFixture(withBatch);
    await expect(
      trace.connect(stranger).recallBatch(1, "x")
    ).to.be.revertedWith("Not admin");
    await expect(trace.recallBatch(1, "Contamination"))
      .to.emit(trace, "BatchRecalled")
      .withArgs(1, "Contamination");
    expect((await trace.getBatch(1)).recalled).to.equal(true);
    await expect(
      trace.connect(lab).recordLabTest(1, true, "l", "h", "n")
    ).to.be.revertedWith("Batch recalled");
  });

  it("emits events for batch creation and steps", async () => {
    const { trace, farmer } = await loadFixture(deploy);
    await expect(
      trace.connect(farmer).createBatch("Brahmi", "Bacopa monnieri", false, "Kerala", "QmB")
    )
      .to.emit(trace, "BatchCreated")
      .withArgs(1, "Brahmi", farmer.address)
      .and.to.emit(trace, "StepAdded")
      .withArgs(1, Stage.Harvested, farmer.address);
  });

  it("anyone (no role) can read batch and history", async () => {
    const { trace, stranger } = await loadFixture(withBatch);
    const b = await trace.connect(stranger).getBatch(1);
    expect(b.herbName).to.equal("Ashwagandha");
    expect((await trace.connect(stranger).getHistory(1)).length).to.equal(1);
  });
});
