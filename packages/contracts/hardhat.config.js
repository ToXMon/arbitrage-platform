require("@nomicfoundation/hardhat-toolbox");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const sepoliaUrl = process.env.SEPOLIA_RPC || process.env.SEPOLIA_RPC_URL || process.env.ETH_RPC_URL || "";
const privateKey = process.env.ETH_PRIVATE_KEY || process.env.PRIVATE_KEY;

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      forking: {
        url: process.env.MAINNET_RPC_URL || "",
        enabled: false
      }
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    sepolia: {
      url: sepoliaUrl,
      accounts: privateKey ? [privateKey] : []
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "",
      accounts: privateKey ? [privateKey] : []
    }
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
