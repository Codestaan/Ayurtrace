require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { AMOY_RPC_URL, PRIVATE_KEY } = process.env;

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  },
  networks: {
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
    ...(AMOY_RPC_URL && PRIVATE_KEY
      ? { amoy: { url: AMOY_RPC_URL, accounts: [PRIVATE_KEY], chainId: 80002 } }
      : {}),
  },
};
