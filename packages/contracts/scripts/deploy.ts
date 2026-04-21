import { ethers } from "hardhat";

async function main() {
  const certiChain = await ethers.deployContract("CertiChain");
  await certiChain.waitForDeployment();
  console.log(`CertiChain deployed to ${certiChain.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
