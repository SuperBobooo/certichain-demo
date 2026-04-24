"use client";

import { useState } from "react";
import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  keccak256,
  toUtf8Bytes,
  type Eip1193Provider,
} from "ethers";
import { useAccount, useChainId } from "wagmi";
import abi from "../abi/certiChain.json";
import { targetChain, targetChainId, targetChainRpcUrl } from "../lib/wallet";

type IssueCertificateInput = {
  certificateId: string;
  recipientName: string;
  courseName: string;
  issuerName: string;
  metadataHash: string;
};

type VerifyCertificateInput = {
  certificateId: string;
  metadataHash: string;
};

type RevokeCertificateInput = {
  certificateId: string;
};

type CertificateDetails = {
  certificateId: string;
  recipientName: string;
  courseName: string;
  issuerName: string;
  metadataHash: string;
  issuerWallet: string;
  issueTime: number;
  revoked: boolean;
  revokedAt: number;
  revokedBy: string;
};

type TransactionStage =
  | "idle"
  | "waiting_wallet"
  | "pending_confirmation"
  | "success";

type IssueStage = TransactionStage;
type RevokeStage = TransactionStage;

type IssueCertificateResult = {
  certificate: CertificateDetails;
  chainId: number;
  chainName: string;
  transactionHash: string;
};

type RevokeCertificateResult = {
  certificate: CertificateDetails;
  chainId: number;
  chainName: string;
  transactionHash: string;
};

type VerificationStatus = "valid" | "revoked" | "hash_mismatch" | "not_found";

type VerificationResult = {
  exists: boolean;
  hashMatches: boolean;
  revoked: boolean;
  valid: boolean;
  status: VerificationStatus;
  certificate: CertificateDetails | null;
};

const contractAddress = process.env
  .NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined;

const getInjectedProvider = () =>
  typeof window === "undefined"
    ? undefined
    : (window as Window & { ethereum?: Eip1193Provider }).ethereum;

const normalizeMetadataText = (metadataText: string) =>
  metadataText.trim().replace(/\r\n/g, "\n");

const hashCertificateMetadata = (metadataText: string) => {
  const normalizedMetadata = normalizeMetadataText(metadataText);

  if (!normalizedMetadata) {
    return "";
  }

  // Demo storage rule: hash normalized metadata locally, then anchor only the hash on-chain.
  return keccak256(toUtf8Bytes(normalizedMetadata));
};

const knownErrorMessages: Record<string, string> = {
  "Certificate not found": "Certificate does not exist.",
  "Certificate already revoked": "Certificate already revoked.",
  "Only issuer can revoke":
    "Only the original issuer can revoke this certificate.",
  "user rejected": "User rejected transaction.",
  "User rejected": "User rejected transaction.",
};

const getReadableErrorMessage = (
  error: unknown,
  fallback: string,
): string => {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const candidate = error as {
    code?: string;
    shortMessage?: string;
    reason?: string;
    message?: string;
    info?: { error?: { message?: string } };
  };

  const rawMessage =
    candidate.shortMessage ??
    candidate.reason ??
    candidate.info?.error?.message ??
    candidate.message ??
    fallback;

  const cleaned = rawMessage.replace("execution reverted: ", "");

  for (const [needle, message] of Object.entries(knownErrorMessages)) {
    if (cleaned.includes(needle)) {
      return message;
    }
  }

  if (candidate.code === "ACTION_REJECTED") {
    return "User rejected transaction.";
  }

  return cleaned;
};

const getReadContract = () => {
  if (!contractAddress) {
    throw new Error(
      "Missing NEXT_PUBLIC_CONTRACT_ADDRESS. Deploy CertiChain and set the frontend env file first.",
    );
  }

  const provider = new JsonRpcProvider(targetChainRpcUrl);
  return new Contract(contractAddress, abi, provider);
};

const getWriteContract = async (address?: `0x${string}`) => {
  const ethereum = getInjectedProvider();

  if (!contractAddress || !ethereum) {
    throw new Error(
      "MetaMask or NEXT_PUBLIC_CONTRACT_ADDRESS is unavailable for transactions.",
    );
  }

  const provider = new BrowserProvider(ethereum);
  const signer = address
    ? await provider.getSigner(address)
    : await provider.getSigner();

  return new Contract(contractAddress, abi, signer);
};

const toCertificateDetails = (
  certificateResponse: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    bigint,
    boolean,
    bigint,
    string,
  ],
): CertificateDetails => ({
  certificateId: certificateResponse[0],
  recipientName: certificateResponse[1],
  courseName: certificateResponse[2],
  issuerName: certificateResponse[3],
  metadataHash: certificateResponse[4],
  issuerWallet: certificateResponse[5],
  issueTime: Number(certificateResponse[6]),
  revoked: certificateResponse[7],
  revokedAt: Number(certificateResponse[8]),
  revokedBy: certificateResponse[9],
});

const getVerificationStatus = (
  exists: boolean,
  hashMatches: boolean,
  revoked: boolean,
  valid: boolean,
): VerificationStatus => {
  if (!exists) {
    return "not_found";
  }

  if (!hashMatches) {
    return "hash_mismatch";
  }

  if (revoked) {
    return "revoked";
  }

  return valid ? "valid" : "hash_mismatch";
};

const useCertiChain = () => {
  const { address } = useAccount();
  const chainId = useChainId();
  const isWrongNetwork = Boolean(address) && chainId !== targetChainId;
  const [issueLoading, setIssueLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [issueStage, setIssueStage] = useState<IssueStage>("idle");
  const [revokeStage, setRevokeStage] = useState<RevokeStage>("idle");
  const [issueTransactionHash, setIssueTransactionHash] = useState<
    string | null
  >(null);
  const [revokeTransactionHash, setRevokeTransactionHash] = useState<
    string | null
  >(null);

  const resetIssueState = () => {
    setIssueError(null);
    setIssueStage("idle");
    setIssueTransactionHash(null);
  };

  const resetRevokeState = () => {
    setRevokeError(null);
    setRevokeStage("idle");
    setRevokeTransactionHash(null);
  };

  const getCertificate = async (
    certificateId: string,
  ): Promise<CertificateDetails> => {
    const contract = getReadContract();
    const certificate = (await contract.getCertificate(certificateId)) as [
      string,
      string,
      string,
      string,
      string,
      string,
      bigint,
      boolean,
      bigint,
      string,
    ];

    return toCertificateDetails(certificate);
  };

  const issueCertificate = async (
    input: IssueCertificateInput,
  ): Promise<IssueCertificateResult> => {
    if (!address) {
      const message = "Connect MetaMask before issuing a certificate.";
      setIssueError(message);
      throw new Error(message);
    }

    if (isWrongNetwork) {
      const message = `Switch MetaMask to ${targetChain.name} (${targetChainId}) before issuing.`;
      setIssueError(message);
      throw new Error(message);
    }

    setIssueLoading(true);
    setIssueError(null);
    setIssueStage("waiting_wallet");
    setIssueTransactionHash(null);

    try {
      const contract = await getWriteContract(address);
      const tx = await contract.issueCertificate(
        input.certificateId,
        input.recipientName,
        input.courseName,
        input.issuerName,
        input.metadataHash,
      );

      const submittedTxHash = tx.hash as string;
      setIssueTransactionHash(submittedTxHash);
      setIssueStage("pending_confirmation");

      const receipt = await tx.wait();
      const certificate = await getCertificate(input.certificateId);

      setIssueStage("success");

      return {
        certificate,
        chainId: targetChainId,
        chainName: `${targetChain.name} (${targetChainId})`,
        transactionHash: receipt?.hash ?? submittedTxHash,
      };
    } catch (error) {
      const message = getReadableErrorMessage(
        error,
        "Unable to issue the certificate on chain.",
      );
      setIssueError(message);
      setIssueStage("idle");
      throw error;
    } finally {
      setIssueLoading(false);
    }
  };

  const verifyCertificate = async (
    input: VerifyCertificateInput,
  ): Promise<VerificationResult> => {
    setVerifyLoading(true);
    setVerifyError(null);

    try {
      const contract = getReadContract();
      const verification = (await contract.verifyCertificate(
        input.certificateId,
        input.metadataHash,
      )) as [boolean, boolean, boolean, boolean];

      const [exists, hashMatches, revoked, valid] = verification;
      const status = getVerificationStatus(
        exists,
        hashMatches,
        revoked,
        valid,
      );

      let certificate: CertificateDetails | null = null;

      if (exists) {
        certificate = await getCertificate(input.certificateId);
      }

      return {
        exists,
        hashMatches,
        revoked,
        valid,
        status,
        certificate,
      };
    } catch (error) {
      const message = getReadableErrorMessage(
        error,
        "Unable to reach the CertiChain contract for verification.",
      );
      setVerifyError(message);
      throw error;
    } finally {
      setVerifyLoading(false);
    }
  };

  const revokeCertificate = async (
    input: RevokeCertificateInput,
  ): Promise<RevokeCertificateResult> => {
    if (!address) {
      const message = "Connect MetaMask before revoking a certificate.";
      setRevokeError(message);
      throw new Error(message);
    }

    if (isWrongNetwork) {
      const message = `Switch MetaMask to ${targetChain.name} (${targetChainId}) before revoking.`;
      setRevokeError(message);
      throw new Error(message);
    }

    setRevokeLoading(true);
    setRevokeError(null);
    setRevokeStage("waiting_wallet");
    setRevokeTransactionHash(null);

    try {
      const contract = await getWriteContract(address);
      const tx = await contract.revokeCertificate(input.certificateId);

      const submittedTxHash = tx.hash as string;
      setRevokeTransactionHash(submittedTxHash);
      setRevokeStage("pending_confirmation");

      const receipt = await tx.wait();
      const certificate = await getCertificate(input.certificateId);

      setRevokeStage("success");

      return {
        certificate,
        chainId: targetChainId,
        chainName: `${targetChain.name} (${targetChainId})`,
        transactionHash: receipt?.hash ?? submittedTxHash,
      };
    } catch (error) {
      const message = getReadableErrorMessage(
        error,
        "Unable to revoke the certificate on chain.",
      );
      setRevokeError(message);
      setRevokeStage("idle");
      throw error;
    } finally {
      setRevokeLoading(false);
    }
  };

  return {
    address,
    chainId,
    contractAddress,
    getCertificate,
    isWrongNetwork,
    issueCertificate,
    issueError,
    issueLoading,
    issueStage,
    issueTransactionHash,
    resetIssueState,
    resetRevokeState,
    revokeCertificate,
    revokeError,
    revokeLoading,
    revokeStage,
    revokeTransactionHash,
    targetChainName: `${targetChain.name} (${targetChainId})`,
    verifyCertificate,
    verifyError,
    verifyLoading,
  };
};

export type {
  CertificateDetails,
  IssueCertificateInput,
  IssueCertificateResult,
  IssueStage,
  RevokeCertificateInput,
  RevokeCertificateResult,
  RevokeStage,
  VerificationResult,
  VerificationStatus,
  VerifyCertificateInput,
};
export { hashCertificateMetadata, useCertiChain };
