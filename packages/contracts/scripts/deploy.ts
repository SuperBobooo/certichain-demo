import { ethers } from "hardhat";

async function main() {
  const certiChain = await ethers.deployContract("CertiChain");
  await certiChain.waitForDeployment();
  console.log(`CertiChain deployed to ${certiChain.target}`);
  console.log(
    "Set NEXT_PUBLIC_CONTRACT_ADDRESS to this address before running the Next.js demo.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
