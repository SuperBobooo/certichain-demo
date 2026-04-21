import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("CertiChain", function () {
  const deployFixture = async () => {
    const [issuer] = await ethers.getSigners();
    const certiChain = await ethers.deployContract("CertiChain");
    await certiChain.waitForDeployment();

    return { certiChain, issuer };
  };

  it("stores an issued certificate and exposes its details", async function () {
    const { certiChain, issuer } = await loadFixture(deployFixture);

    await expect(
      certiChain.issueCertificate(
        "CERT-001",
        "Alice Zhang",
        "Blockchain Fundamentals",
        "CertiChain Academy",
        "0xhash001",
      ),
    )
      .to.emit(certiChain, "CertificateIssued")
      .withArgs(
        anyValue,
        "Alice Zhang",
        "Blockchain Fundamentals",
        "CertiChain Academy",
        "0xhash001",
        issuer.address,
        anyValue,
      );

    const certificate = await certiChain.getCertificate("CERT-001");

    expect(certificate[0]).to.equal("CERT-001");
    expect(certificate[1]).to.equal("Alice Zhang");
    expect(certificate[2]).to.equal("Blockchain Fundamentals");
    expect(certificate[3]).to.equal("CertiChain Academy");
    expect(certificate[4]).to.equal("0xhash001");
    expect(certificate[5]).to.equal(issuer.address);
    expect(certificate[7]).to.equal(true);
  });

  it("rejects duplicate certificate IDs", async function () {
    const { certiChain } = await loadFixture(deployFixture);

    await certiChain.issueCertificate(
      "CERT-001",
      "Alice Zhang",
      "Blockchain Fundamentals",
      "CertiChain Academy",
      "0xhash001",
    );

    await expect(
      certiChain.issueCertificate(
        "CERT-001",
        "Bob Li",
        "Advanced Solidity",
        "Another Issuer",
        "0xhash002",
      ),
    ).to.be.revertedWith("Certificate already exists");
  });

  it("verifies only existing certificates with the matching hash", async function () {
    const { certiChain } = await loadFixture(deployFixture);

    await certiChain.issueCertificate(
      "CERT-001",
      "Alice Zhang",
      "Blockchain Fundamentals",
      "CertiChain Academy",
      "0xhash001",
    );

    expect(
      await certiChain.verifyCertificate("CERT-001", "0xhash001"),
    ).to.equal(true);
    expect(
      await certiChain.verifyCertificate("CERT-001", "0xwronghash"),
    ).to.equal(false);
    expect(
      await certiChain.verifyCertificate("CERT-404", "0xhash001"),
    ).to.equal(false);
  });
});
