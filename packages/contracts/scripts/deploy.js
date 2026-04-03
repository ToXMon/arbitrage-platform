const hre = require("hardhat");

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";

  const AAVE_POOL_ADDRESSES_PROVIDER = (() => {
    if (chainId === 11155111) {
      // Aave V3 Sepolia
      return "0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A";
    }

    if (chainId === 1) {
      return "0x2F39D218133EFAB8f2B819b1066C7e434Ad62e85";
    }

    if (chainId === 42161) {
      return "0x794a61358D6845594F94dc1DB02A252b5b4814aD";
    }

    if (chainId === 10) {
      return "0xa97684ead0E402Dc232D5A977953dF7ecEB5046A";
    }

    if (chainId === 8453) {
      return "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D";
    }

    if (chainId === 137) {
      return "0x5343b5bA672Ae99d627A1C87866b8E53F47Db2E6";
    }

    if (chainId === 43114) {
      return "0xa97684ead0E402Dc232D5A977953dF7ecEB5046A";
    }

    throw new Error(`Unsupported chainId: ${chainId}`);
  })();

  const [deployer] = await hre.ethers.getSigners();

  const Arbitrage = await hre.ethers.getContractFactory("Arbitrage");
  const arbitrage = await Arbitrage.deploy(
    AAVE_POOL_ADDRESSES_PROVIDER,
    BALANCER_VAULT
  );

  await arbitrage.waitForDeployment();

  const address = await arbitrage.getAddress();
  const deployTx = arbitrage.deploymentTransaction();

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
