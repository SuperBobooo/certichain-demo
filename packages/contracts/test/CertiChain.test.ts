import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("CertiChain", function () {
  const deployFixture = async () => {
    const [issuer, otherAccount] = await ethers.getSigners();
    const certiChain = await ethers.deployContract("CertiChain");
    await certiChain.waitForDeployment();

    return { certiChain, issuer, otherAccount };
  };

  const issueSampleCertificate = async (certiChain: any) => {
    await certiChain.issueCertificate(
      "CERT-001",
      "Alice Zhang",
      "Blockchain Fundamentals",
      "CertiChain Academy",
      "0xhash001",
    );
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
    expect(certificate[7]).to.equal(false);
    expect(certificate[8]).to.equal(0n);
    expect(certificate[9]).to.equal(ethers.ZeroAddress);
  });

  it("rejects duplicate certificate IDs", async function () {
    const { certiChain } = await loadFixture(deployFixture);

    await issueSampleCertificate(certiChain);

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

  it("verifies active certificates with the matching hash", async function () {
    const { certiChain } = await loadFixture(deployFixture);

    await issueSampleCertificate(certiChain);

    const result = await certiChain.verifyCertificate("CERT-001", "0xhash001");

    expect(result.exists).to.equal(true);
    expect(result.hashMatches).to.equal(true);
    expect(result.revoked).to.equal(false);
    expect(result.valid).to.equal(true);
  });

  it("marks tampered metadata as a hash mismatch", async function () {
    const { certiChain } = await loadFixture(deployFixture);

    await issueSampleCertificate(certiChain);

    const result = await certiChain.verifyCertificate(
      "CERT-001",
      "0xwronghash",
    );

    expect(result.exists).to.equal(true);
    expect(result.hashMatches).to.equal(false);
    expect(result.revoked).to.equal(false);
    expect(result.valid).to.equal(false);
  });

  it("returns not found status for missing certificate IDs", async function () {
    const { certiChain } = await loadFixture(deployFixture);

    const result = await certiChain.verifyCertificate("CERT-404", "0xhash001");

    expect(result.exists).to.equal(false);
    expect(result.hashMatches).to.equal(false);
    expect(result.revoked).to.equal(false);
    expect(result.valid).to.equal(false);
  });

  it("allows the original issuer to revoke a certificate", async function () {
    const { certiChain, issuer } = await loadFixture(deployFixture);

    await issueSampleCertificate(certiChain);

    await expect(certiChain.revokeCertificate("CERT-001"))
      .to.emit(certiChain, "CertificateRevoked")
      .withArgs(anyValue, issuer.address, anyValue);

    const certificate = await certiChain.getCertificate("CERT-001");

    expect(certificate.revoked).to.equal(true);
    expect(certificate.revokedAt > 0n).to.equal(true);
    expect(certificate.revokedBy).to.equal(issuer.address);
  });

  it("rejects duplicate revocations", async function () {
    const { certiChain } = await loadFixture(deployFixture);

    await issueSampleCertificate(certiChain);
    await certiChain.revokeCertificate("CERT-001");

    await expect(certiChain.revokeCertificate("CERT-001")).to.be.revertedWith(
      "Certificate already revoked",
    );
  });

  it("rejects revocation from a non-issuer wallet", async function () {
    const { certiChain, otherAccount } = await loadFixture(deployFixture);

    await issueSampleCertificate(certiChain);

    await expect(
      certiChain.connect(otherAccount).revokeCertificate("CERT-001"),
    ).to.be.revertedWith("Only issuer can revoke");
  });

  it("marks revoked certificates as not valid even when the hash matches", async function () {
    const { certiChain } = await loadFixture(deployFixture);

    await issueSampleCertificate(certiChain);
    await certiChain.revokeCertificate("CERT-001");

    const result = await certiChain.verifyCertificate("CERT-001", "0xhash001");

    expect(result.exists).to.equal(true);
    expect(result.hashMatches).to.equal(true);
    expect(result.revoked).to.equal(true);
    expect(result.valid).to.equal(false);
  });
});
