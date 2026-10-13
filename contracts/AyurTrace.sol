// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AyurTrace - farm-to-customer traceability for Ayurvedic raw materials
/// @notice Every herb batch moves through
///         Harvested -> LabTested -> Processed -> Distributed -> Retail.
///         Each step is logged with actor, timestamp, location and an IPFS hash
///         of the evidence (photo, certificate, lab report). Anyone can read it.
contract AyurTrace {
    enum Role { None, Farmer, Lab, Processor, Distributor, Retailer }
    enum Stage { Harvested, LabTested, Processed, Distributed, Retail }

    struct Step {
        Stage stage;
        address actor;
        uint256 timestamp;
        string location;      // village/district text or "lat,long"
        string evidenceHash;  // IPFS CID of photo / report / certificate
        string note;
    }

    struct Batch {
        uint256 id;
        string herbName;       // e.g. Ashwagandha
        string botanicalName;  // e.g. Withania somnifera
        address farmer;
        bool organicCertified;
        bool labPassed;
        bool recalled;
        bool exists;
        Stage currentStage;
    }

    address public admin;
    uint256 public batchCount;

    mapping(address => Role) public roles;
    mapping(uint256 => Batch) private batches;
    mapping(uint256 => Step[]) private history;

    event RoleGranted(address indexed user, Role role);
    event BatchCreated(uint256 indexed batchId, string herbName, address indexed farmer);
    event StepAdded(uint256 indexed batchId, Stage stage, address indexed actor);
    event BatchRecalled(uint256 indexed batchId, string reason);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyRole(Role r) {
        require(roles[msg.sender] == r, "Wrong role");
        _;
    }

    modifier batchExists(uint256 id) {
        require(batches[id].exists, "No such batch");
        _;
    }

    modifier notRecalled(uint256 id) {
        require(!batches[id].recalled, "Batch recalled");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // ---------------- Admin ----------------

    /// @notice Register (or revoke with Role.None) a verified participant.
    function grantRole(address user, Role role) external onlyAdmin {
        roles[user] = role;
        emit RoleGranted(user, role);
    }

    /// @notice Recall a batch (contamination, fraud...). Freezes further steps.
    function recallBatch(uint256 id, string calldata reason)
        external
        onlyAdmin
        batchExists(id)
    {
        batches[id].recalled = true;
        emit BatchRecalled(id, reason);
    }

    // ---------------- 1. Farmer ----------------

    function createBatch(
        string calldata herbName,
        string calldata botanicalName,
        bool organicCertified,
        string calldata location,
        string calldata evidenceHash
    ) external onlyRole(Role.Farmer) returns (uint256) {
        require(bytes(herbName).length > 0, "Herb name required");
        uint256 id = ++batchCount;
        // Field-by-field via a storage pointer keeps stack usage low
        // (a 9-field struct literal next to 5 calldata strings risks "stack too deep").
        Batch storage b = batches[id];
        b.id = id;
        b.herbName = herbName;
        b.botanicalName = botanicalName;
        b.farmer = msg.sender;
        b.organicCertified = organicCertified;
        b.exists = true;
        b.currentStage = Stage.Harvested;
        _log(id, Stage.Harvested, location, evidenceHash, "Harvested");
        emit BatchCreated(id, herbName, msg.sender);
        return id;
    }

    // ---------------- 2. Lab ----------------

    function recordLabTest(
        uint256 id,
        bool passed,
        string calldata location,
        string calldata reportHash,
        string calldata note
    ) external onlyRole(Role.Lab) batchExists(id) notRecalled(id) {
        require(batches[id].currentStage == Stage.Harvested, "Bad stage");
        batches[id].labPassed = passed;
        batches[id].currentStage = Stage.LabTested;
        _log(id, Stage.LabTested, location, reportHash, note);
    }

    // ---------------- 3. Processor ----------------

    function recordProcessing(
        uint256 id,
        string calldata location,
        string calldata evidenceHash,
        string calldata note
    ) external onlyRole(Role.Processor) batchExists(id) notRecalled(id) {
        require(batches[id].labPassed, "Lab test not passed");
        require(batches[id].currentStage == Stage.LabTested, "Bad stage");
        batches[id].currentStage = Stage.Processed;
        _log(id, Stage.Processed, location, evidenceHash, note);
    }

    // ---------------- 4. Distributor ----------------

    function recordDistribution(
        uint256 id,
        string calldata location,
        string calldata evidenceHash,
        string calldata note
    ) external onlyRole(Role.Distributor) batchExists(id) notRecalled(id) {
        require(batches[id].currentStage == Stage.Processed, "Bad stage");
        batches[id].currentStage = Stage.Distributed;
        _log(id, Stage.Distributed, location, evidenceHash, note);
    }

    // ---------------- 5. Retailer ----------------

    function recordRetail(
        uint256 id,
        string calldata location,
        string calldata evidenceHash,
        string calldata note
    ) external onlyRole(Role.Retailer) batchExists(id) notRecalled(id) {
        require(batches[id].currentStage == Stage.Distributed, "Bad stage");
        batches[id].currentStage = Stage.Retail;
        _log(id, Stage.Retail, location, evidenceHash, note);
    }

    // ---------------- Public reads (customers) ----------------

    function getBatch(uint256 id)
        external
        view
        batchExists(id)
        returns (Batch memory)
    {
        return batches[id];
    }

    function getHistory(uint256 id)
        external
        view
        batchExists(id)
        returns (Step[] memory)
    {
        return history[id];
    }

    // ---------------- Internal ----------------

    function _log(
        uint256 id,
        Stage s,
        string memory loc,
        string memory ev,
        string memory note
    ) internal {
        history[id].push(Step(s, msg.sender, block.timestamp, loc, ev, note));
        emit StepAdded(id, s, msg.sender);
    }
}
