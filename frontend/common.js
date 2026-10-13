/* Shared helpers: ABI, contract access, formatting, optional IPFS upload */
const CFG = window.AYUR_CONFIG;

const ABI = [
  "function admin() view returns (address)",
  "function batchCount() view returns (uint256)",
  "function roles(address) view returns (uint8)",
  "function grantRole(address user, uint8 role)",
  "function recallBatch(uint256 id, string reason)",
  "function createBatch(string herbName, string botanicalName, bool organicCertified, string location, string evidenceHash) returns (uint256)",
  "function recordLabTest(uint256 id, bool passed, string location, string reportHash, string note)",
  "function recordProcessing(uint256 id, string location, string evidenceHash, string note)",
  "function recordDistribution(uint256 id, string location, string evidenceHash, string note)",
  "function recordRetail(uint256 id, string location, string evidenceHash, string note)",
  "function getBatch(uint256 id) view returns (tuple(uint256 id, string herbName, string botanicalName, address farmer, bool organicCertified, bool labPassed, bool recalled, bool exists, uint8 currentStage))",
  "function getHistory(uint256 id) view returns (tuple(uint8 stage, address actor, uint256 timestamp, string location, string evidenceHash, string note)[])",
];

const STAGES = ["Harvested", "Lab Tested", "Processed", "Distributed", "On Retail Shelf"];
const STAGE_ICONS = ["🌱", "🔬", "⚙️", "🚚", "🏪"];
const ROLES = ["None", "Farmer", "Lab", "Processor", "Distributor", "Retailer"];

/** Escape on-chain text before putting it in HTML (it is user-supplied!). */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function shortAddr(a) {
  return a ? a.slice(0, 6) + "…" + a.slice(-4) : "";
}

function ipfsLink(hash) {
  if (!hash) return "";
  return `<a href="https://gateway.pinata.cloud/ipfs/${encodeURIComponent(hash)}" target="_blank" rel="noopener">📎 evidence (${esc(hash.slice(0, 10))}…)</a>`;
}

/** Read-only contract: works for customers without a wallet. */
function readContract() {
  const provider = CFG.rpcUrl
    ? new ethers.JsonRpcProvider(CFG.rpcUrl)
    : new ethers.BrowserProvider(window.ethereum);
  return new ethers.Contract(CFG.contractAddress, ABI, provider);
}

/** Wallet-connected contract: for farmers, labs, etc. */
async function walletContract() {
  if (!window.ethereum) throw new Error("MetaMask not found. Please install it.");
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== CFG.chainId) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x" + CFG.chainId.toString(16) }],
      });
    } catch (e) {
      throw new Error(`Please switch MetaMask to ${CFG.networkName} (chainId ${CFG.chainId}).`);
    }
  }
  const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
  return { contract: new ethers.Contract(CFG.contractAddress, ABI, signer), address: await signer.getAddress() };
}

/** Optional: pin a file to IPFS via Pinata. Returns the CID. */
async function uploadToPinata(file, jwt) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: "Bearer " + jwt },
    body: fd,
  });
  if (!res.ok) throw new Error("Pinata upload failed: " + res.status);
  return (await res.json()).IpfsHash;
}

function niceError(e) {
  return e?.reason || e?.shortMessage || e?.info?.error?.message || e?.message || String(e);
}
