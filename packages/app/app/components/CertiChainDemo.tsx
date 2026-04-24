"use client";

import { FormEvent, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useConnect, useSwitchChain } from "wagmi";
import {
  hashCertificateMetadata,
  type CertificateDetails,
  type IssueStage,
  type RevokeStage,
  type VerificationResult,
  type VerificationStatus,
  useCertiChain,
} from "../hooks/useCertiChain";
import { targetChainId } from "../lib/wallet";

type IssueFormState = {
  certificateId: string;
  recipientName: string;
  courseName: string;
  issuerName: string;
  metadataText: string;
};

type VerifyFormState = {
  certificateId: string;
  metadataText: string;
};

type RevokeFormState = {
  certificateId: string;
};

type FieldErrors<T> = Partial<Record<keyof T, string>>;

type LatestIssuedSnapshot = {
  certificate: CertificateDetails;
  metadataText: string;
  chainName: string;
  transactionHash: string;
  storedAt: number;
};

type VerificationPanelState = VerificationResult & {
  certificateId: string;
  metadataHash: string;
  checkedAt: number;
};

type RevokePanelState = {
  certificate: CertificateDetails;
  transactionHash: string;
  revokedAt: number;
};

type ProgressState = "pending" | "active" | "done";

const initialIssueForm: IssueFormState = {
  certificateId: "",
  recipientName: "",
  courseName: "",
  issuerName: "",
  metadataText: "",
};

const initialVerifyForm: VerifyFormState = {
  certificateId: "",
  metadataText: "",
};

const initialRevokeForm: RevokeFormState = {
  certificateId: "",
};

const sampleIssueForm: IssueFormState = {
  certificateId: "CERT-2026-001",
  recipientName: "Alice Zhang",
  courseName: "Blockchain Fundamentals Bootcamp",
  issuerName: "CertiChain Academy",
  metadataText: `Recipient: Alice Zhang
Program: Blockchain Fundamentals Bootcamp
Completion Date: 2026-04-16
Credential Level: Distinction
Verifier: CertiChain Academy`,
};

const latestIssuedStorageKey = "certichain.latest-issued-certificate";

const introSections = [
  {
    id: "why",
    title: "Why this demo",
    content: [
      "PDF certificates and screenshots are easy to copy, edit, and redistribute.",
      "A verifier usually cannot tell whether a file came from the issuer or was changed later.",
      "CertiChain demonstrates how a blockchain record can act as a tamper-resistant trust anchor.",
      "The goal is to make the authenticity problem visible in a short classroom workflow.",
    ],
  },
  {
    id: "how",
    title: "How it works",
    content: [
      "The issuer enters certificate fields and metadata text in the browser.",
      "The frontend normalizes the metadata text and computes a hash locally.",
      "MetaMask submits the certificate ID, public fields, issuer wallet, and metadata hash to the local chain.",
      "Verification recomputes the hash from the submitted metadata and compares it with the on-chain anchor.",
    ],
  },
  {
    id: "storage",
    title: "On-chain vs off-chain",
    content: [
      "On-chain: certificate ID, recipient, course, issuer name, issuer wallet, metadata hash, issue time, and revoke status.",
      "Off-chain: the original metadata text and any full certificate document.",
      "This keeps the demo privacy-friendly while still proving whether the metadata was changed.",
      "A revoked record remains visible, but it is no longer treated as valid.",
    ],
  },
];

const demoFlow = [
  "Issue a certificate",
  "Verify the original metadata",
  "Revoke the certificate",
  "Verify again to show revoked",
];

const statusContent: Record<
  VerificationStatus,
  { label: string; tone: string; description: string }
> = {
  valid: {
    label: "VALID",
    tone: "emerald",
    description:
      "The certificate exists, the metadata hash matches, and the record has not been revoked.",
  },
  revoked: {
    label: "REVOKED",
    tone: "amber",
    description:
      "The metadata hash still matches, but the original issuer has revoked this certificate.",
  },
  hash_mismatch: {
    label: "HASH MISMATCH",
    tone: "rose",
    description:
      "The certificate exists, but the provided metadata produces a different hash.",
  },
  not_found: {
    label: "NOT FOUND",
    tone: "slate",
    description:
      "No certificate with this ID was found in the deployed CertiChain contract.",
  },
};

const truncateMiddle = (value: string, start = 10, end = 8) =>
  value.length <= start + end + 3
    ? value
    : `${value.slice(0, start)}...${value.slice(-end)}`;

const formatIssueTime = (issueTime: number) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(issueTime * 1000));

const formatPanelTimestamp = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));

const formatOptionalChainTime = (timestamp: number) =>
  timestamp > 0 ? formatIssueTime(timestamp) : "Not revoked";

const validateIssueForm = (
  form: IssueFormState,
): FieldErrors<IssueFormState> => {
  const errors: FieldErrors<IssueFormState> = {};

  if (!form.certificateId.trim()) {
    errors.certificateId = "Certificate ID is required.";
  } else if (form.certificateId.trim().length < 6) {
    errors.certificateId =
      "Use at least 6 characters so the demo record is easy to identify.";
  }

  if (!form.recipientName.trim()) {
    errors.recipientName = "Recipient name is required.";
  }

  if (!form.courseName.trim()) {
    errors.courseName = "Course / achievement name is required.";
  }

  if (!form.issuerName.trim()) {
    errors.issuerName = "Issuer name is required.";
  }

  if (!form.metadataText.trim()) {
    errors.metadataText =
      "Metadata text is required to compute the on-chain hash.";
  }

  return errors;
};

const validateVerifyForm = (
  form: VerifyFormState,
): FieldErrors<VerifyFormState> => {
  const errors: FieldErrors<VerifyFormState> = {};

  if (!form.certificateId.trim()) {
    errors.certificateId = "Certificate ID is required.";
  } else if (form.certificateId.trim().length < 6) {
    errors.certificateId = "Use the full certificate ID before verifying.";
  }

  if (!form.metadataText.trim()) {
    errors.metadataText =
      "Metadata text is required so the same hash can be reproduced locally.";
  }

  return errors;
};

const validateRevokeForm = (
  form: RevokeFormState,
): FieldErrors<RevokeFormState> => {
  const errors: FieldErrors<RevokeFormState> = {};

  if (!form.certificateId.trim()) {
    errors.certificateId = "Certificate ID is required.";
  } else if (form.certificateId.trim().length < 6) {
    errors.certificateId = "Use the full certificate ID before revoking.";
  }

  return errors;
};

const getTransactionProgressState = (
  step: "wallet" | "submitted" | "confirmation" | "success",
  stage: IssueStage | RevokeStage,
  transactionHash: string | null,
): ProgressState => {
  if (step === "wallet") {
    if (stage === "waiting_wallet") {
      return "active";
    }

    if (
      stage === "pending_confirmation" ||
      stage === "success" ||
      transactionHash
    ) {
      return "done";
    }
  }

  if (step === "submitted") {
    return transactionHash ? "done" : "pending";
  }

  if (step === "confirmation") {
    if (stage === "pending_confirmation") {
      return "active";
    }

    if (stage === "success") {
      return "done";
    }
  }

  if (step === "success") {
    return stage === "success" ? "done" : "pending";
  }

  return "pending";
};

const getStatusClasses = (tone: string) => {
  if (tone === "emerald") {
    return "border-emerald-200 bg-emerald-50/75 text-emerald-900";
  }

  if (tone === "amber") {
    return "border-amber-200 bg-amber-50/80 text-amber-900";
  }

  if (tone === "rose") {
    return "border-rose-200 bg-rose-50/85 text-rose-900";
  }

  return "border-slate-200 bg-slate-50/85 text-slate-800";
};

const CopyButton = ({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Unable to copy in this browser.");
    }
  };

  return (
    <button
      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
      type="button"
      onClick={handleCopy}
    >
      {label}
    </button>
  );
};

const SectionHeader = ({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) => (
  <div className="space-y-3">
    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
      {eyebrow}
    </p>
    <div className="space-y-2">
      <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
        {title}
      </h3>
      <p className="text-sm leading-6 text-slate-600">{description}</p>
    </div>
  </div>
);

const DetailRow = ({
  label,
  value,
  mono = false,
  copyValue,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyValue?: string;
}) => (
  <div className="space-y-2 rounded-2xl border border-slate-100 bg-white/70 p-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      {copyValue && <CopyButton value={copyValue} />}
    </div>
    <p
      className={`text-sm text-slate-700 ${
        mono ? "break-all font-mono text-[13px]" : ""
      }`}
    >
      {value}
    </p>
  </div>
);

const FieldErrorText = ({ message }: { message?: string }) =>
  message ? <p className="mt-2 text-xs text-rose-600">{message}</p> : null;

const ResultPlaceholder = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50/70 p-6 text-sm text-slate-500">
    <p className="font-medium text-slate-700">{title}</p>
    <p className="mt-2 leading-6">{description}</p>
  </div>
);

const ProgressItem = ({
  label,
  state,
}: {
  label: string;
  state: ProgressState;
}) => (
  <div className="flex items-center gap-3">
    <span
      className={`h-3 w-3 rounded-full ${
        state === "done"
          ? "bg-emerald-500"
          : state === "active"
            ? "bg-amber-500 ring-4 ring-amber-100"
            : "bg-slate-200"
      }`}
    />
    <p
      className={`text-sm ${
        state === "pending" ? "text-slate-500" : "text-slate-800"
      }`}
    >
      {label}
    </p>
  </div>
);

const TransactionProgress = ({
  successLabel,
  stage,
  transactionHash,
}: {
  successLabel: string;
  stage: IssueStage | RevokeStage;
  transactionHash: string | null;
}) => (
  <div className="mt-5 space-y-3">
    <ProgressItem
      label="Waiting for wallet confirmation"
      state={getTransactionProgressState("wallet", stage, transactionHash)}
    />
    <ProgressItem
      label="Transaction submitted"
      state={getTransactionProgressState("submitted", stage, transactionHash)}
    />
    <ProgressItem
      label="Waiting for block confirmation"
      state={getTransactionProgressState("confirmation", stage, transactionHash)}
    />
    <ProgressItem
      label={successLabel}
      state={getTransactionProgressState("success", stage, transactionHash)}
    />
  </div>
);

const CertificateStatusPill = ({ revoked }: { revoked: boolean }) => (
  <span
    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
      revoked
        ? "bg-amber-100 text-amber-800"
        : "bg-emerald-100 text-emerald-800"
    }`}
  >
    {revoked ? "Revoked" : "Active"}
  </span>
);

const CertiChainDemo = () => {
  const [issueForm, setIssueForm] = useState<IssueFormState>(initialIssueForm);
  const [verifyForm, setVerifyForm] =
    useState<VerifyFormState>(initialVerifyForm);
  const [revokeForm, setRevokeForm] =
    useState<RevokeFormState>(initialRevokeForm);
  const [issueErrors, setIssueErrors] = useState<FieldErrors<IssueFormState>>(
    {},
  );
  const [verifyErrors, setVerifyErrors] = useState<FieldErrors<VerifyFormState>>(
    {},
  );
  const [revokeErrors, setRevokeErrors] = useState<FieldErrors<RevokeFormState>>(
    {},
  );
  const [latestIssued, setLatestIssued] =
    useState<LatestIssuedSnapshot | null>(null);
  const [verificationPanel, setVerificationPanel] =
    useState<VerificationPanelState | null>(null);
  const [revokePanel, setRevokePanel] = useState<RevokePanelState | null>(null);
  const [openIntroSection, setOpenIntroSection] = useState<string | null>(null);

  const issueMetadataHash = hashCertificateMetadata(issueForm.metadataText);
  const verifyMetadataHash = hashCertificateMetadata(verifyForm.metadataText);

  const {
    address,
    chainId,
    contractAddress,
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
    targetChainName,
    verifyCertificate,
    verifyError,
    verifyLoading,
  } = useCertiChain();

  const { connect, connectors, isPending: isConnecting } = useConnect();
  const {
    switchChain,
    isPending: isSwitchingChain,
    error: switchChainError,
  } = useSwitchChain();

  const injectedConnector = connectors[0];

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(latestIssuedStorageKey);

    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as LatestIssuedSnapshot;

      if (parsed?.certificate?.certificateId) {
        setLatestIssued(parsed);
      }
    } catch {
      window.localStorage.removeItem(latestIssuedStorageKey);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !latestIssued) {
      return;
    }

    window.localStorage.setItem(
      latestIssuedStorageKey,
      JSON.stringify(latestIssued),
    );
  }, [latestIssued]);

  const issueStatusTitle = issueError
    ? "Issuance failed"
    : issueStage === "waiting_wallet"
      ? "Waiting for wallet confirmation"
      : issueStage === "pending_confirmation"
        ? "Waiting for block confirmation"
        : issueStage === "success"
          ? "Certificate issued successfully"
          : "Ready to issue";

  const issueStatusDescription = issueError
    ? issueError
    : issueStage === "waiting_wallet"
      ? "Confirm the transaction in MetaMask to submit the certificate record."
      : issueStage === "pending_confirmation"
        ? "The transaction has been submitted. Wait for the local block confirmation."
        : issueStage === "success"
          ? "The certificate record is anchored on chain and ready to verify."
          : "Fill the form, inspect the local metadata hash, then issue the record on chain.";

  const revokeStatusTitle = revokeError
    ? "Revocation failed"
    : revokeStage === "waiting_wallet"
      ? "Waiting for wallet confirmation"
      : revokeStage === "pending_confirmation"
        ? "Waiting for block confirmation"
        : revokeStage === "success"
          ? "Certificate revoked successfully"
          : "Ready to revoke";

  const revokeStatusDescription = revokeError
    ? revokeError
    : revokeStage === "waiting_wallet"
      ? "Confirm the revocation transaction in MetaMask."
      : revokeStage === "pending_confirmation"
        ? "The revocation transaction has been submitted and is waiting for confirmation."
        : revokeStage === "success"
          ? "The certificate remains on chain, but future verification will report it as revoked."
          : "Only the original issuer wallet can revoke a certificate in this demo.";

  const handleIssueFieldChange = (
    field: keyof IssueFormState,
    value: string,
  ) => {
    setIssueForm((current) => ({
      ...current,
      [field]: value,
    }));

    setIssueErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
  };

  const handleVerifyFieldChange = (
    field: keyof VerifyFormState,
    value: string,
  ) => {
    setVerifyForm((current) => ({
      ...current,
      [field]: value,
    }));

    setVerifyErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
  };

  const handleRevokeFieldChange = (
    field: keyof RevokeFormState,
    value: string,
  ) => {
    setRevokeForm((current) => ({
      ...current,
      [field]: value,
    }));

    setRevokeErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
  };

  const handleUseSampleData = () => {
    setIssueForm(sampleIssueForm);
    setIssueErrors({});
    resetIssueState();
  };

  const handleLoadLatestIntoVerify = () => {
    if (!latestIssued) {
      return;
    }

    setVerifyForm({
      certificateId: latestIssued.certificate.certificateId,
      metadataText: latestIssued.metadataText,
    });
    setVerifyErrors({});
    toast.success("Latest issued certificate loaded into the verify form.");
  };

  const handleLoadLatestIntoRevoke = () => {
    if (!latestIssued) {
      return;
    }

    setRevokeForm({
      certificateId: latestIssued.certificate.certificateId,
    });
    setRevokeErrors({});
    resetRevokeState();
    toast.success("Latest issued certificate loaded into the revoke form.");
  };

  const handleIssueSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validateIssueForm(issueForm);
    setIssueErrors(nextErrors);

    if (Object.values(nextErrors).some(Boolean)) {
      toast.error("Complete the required certificate fields before issuing.");
      return;
    }

    if (!issueMetadataHash) {
      toast.error("Metadata hash could not be generated from the current text.");
      return;
    }

    try {
      const result = await issueCertificate({
        certificateId: issueForm.certificateId.trim(),
        recipientName: issueForm.recipientName.trim(),
        courseName: issueForm.courseName.trim(),
        issuerName: issueForm.issuerName.trim(),
        metadataHash: issueMetadataHash,
      });

      const nextLatestIssued: LatestIssuedSnapshot = {
        certificate: result.certificate,
        metadataText: issueForm.metadataText.trim(),
        chainName: result.chainName,
        transactionHash: result.transactionHash,
        storedAt: Date.now(),
      };

      setLatestIssued(nextLatestIssued);
      setRevokePanel(null);
      setIssueForm(initialIssueForm);
      setIssueErrors({});
      toast.success("Certificate issued on chain.");
    } catch {
      toast.error("Certificate issuance failed.");
    }
  };

  const handleVerifySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validateVerifyForm(verifyForm);
    setVerifyErrors(nextErrors);

    if (Object.values(nextErrors).some(Boolean)) {
      toast.error(
        "Complete the certificate ID and metadata text before verifying.",
      );
      return;
    }

    if (!verifyMetadataHash) {
      toast.error("Metadata hash could not be generated from the current text.");
      return;
    }

    try {
      const result = await verifyCertificate({
        certificateId: verifyForm.certificateId.trim(),
        metadataHash: verifyMetadataHash,
      });

      setVerificationPanel({
        ...result,
        certificateId: verifyForm.certificateId.trim(),
        metadataHash: verifyMetadataHash,
        checkedAt: Date.now(),
      });

      if (result.status === "valid") {
        toast.success("Certificate verified successfully.");
      } else if (result.status === "revoked") {
        toast.warn("Certificate is revoked.");
      } else if (result.status === "not_found") {
        toast.error("Certificate not found.");
      } else {
        toast.error("Certificate metadata hash does not match.");
      }
    } catch {
      toast.error("Unable to verify the certificate.");
    }
  };

  const handleRevokeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validateRevokeForm(revokeForm);
    setRevokeErrors(nextErrors);

    if (Object.values(nextErrors).some(Boolean)) {
      toast.error("Enter the certificate ID before revoking.");
      return;
    }

    try {
      const result = await revokeCertificate({
        certificateId: revokeForm.certificateId.trim(),
      });

      setRevokePanel({
        certificate: result.certificate,
        transactionHash: result.transactionHash,
        revokedAt: Date.now(),
      });

      setLatestIssued((current) => {
        if (
          !current ||
          current.certificate.certificateId !== result.certificate.certificateId
        ) {
          return current;
        }

        return {
          ...current,
          certificate: result.certificate,
          transactionHash: result.transactionHash,
          storedAt: Date.now(),
        };
      });

      setRevokeErrors({});
      toast.success("Certificate revoked on chain.");
    } catch {
      toast.error("Certificate revocation failed.");
    }
  };

  const walletCardValue = address
    ? truncateMiddle(address, 10, 6)
    : "Disconnected";
  const chainStatusValue = address
    ? chainId === targetChainId
      ? targetChainName
      : `Unsupported / different network (${chainId})`
    : targetChainName;
  const contractCardValue = contractAddress
    ? truncateMiddle(contractAddress, 10, 6)
    : "Not configured";

  const renderWalletWriteNotice = (action: "issue" | "revoke") => (
    <>
      {!address && (
        <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-sm text-slate-700">
            MetaMask is required because {action} sends a transaction.
          </p>
          <button
            className="mt-4 rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() =>
              injectedConnector && connect({ connector: injectedConnector })
            }
            disabled={!injectedConnector || isConnecting}
            type="button"
          >
            {isConnecting ? "Connecting MetaMask..." : "Connect MetaMask"}
          </button>
        </div>
      )}

      {address && isWrongNetwork && (
        <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50/90 p-4">
          <p className="text-sm text-amber-900">
            MetaMask is on the wrong network. Switch to {targetChainName} to
            {` ${action}`} certificates on the demo chain.
          </p>
          <button
            className="mt-4 rounded-full bg-amber-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => switchChain({ chainId: targetChainId })}
            disabled={isSwitchingChain}
            type="button"
          >
            {isSwitchingChain
              ? "Switching Network..."
              : `Switch to ${targetChainName}`}
          </button>
          {switchChainError && (
            <p className="mt-3 text-sm text-rose-600">
              Automatic switching failed. Select {targetChainName} manually in
              MetaMask and try again.
            </p>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-8 pb-16">
      <section className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <article className="panel-shadow relative overflow-hidden rounded-[34px] border border-white/70 bg-white/82 p-8 backdrop-blur-xl md:p-10">
          <div className="relative space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-slate-500">
              Course Demo Prototype
            </p>
            <div className="space-y-4">
              <h2 className="text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                CertiChain
              </h2>
              <p className="max-w-3xl text-lg text-slate-700 md:text-xl">
                Tamper-resistant certificate issuance, verification, and
                revocation powered by blockchain
              </p>
              <p className="max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
                CertiChain anchors certificate metadata hashes on a local
                Ethereum demo chain. The original metadata stays off-chain, and
                verifiers later recompute the same hash to check authenticity.
              </p>
            </div>

            <div className="space-y-3">
              {introSections.map((section) => {
                const isOpen = openIntroSection === section.id;

                return (
                  <div
                    className="rounded-[22px] border border-slate-200 bg-slate-50/80"
                    key={section.id}
                  >
                    <button
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                      type="button"
                      onClick={() =>
                        setOpenIntroSection(isOpen ? null : section.id)
                      }
                      aria-expanded={isOpen}
                    >
                      <span className="text-sm font-semibold text-slate-900">
                        {section.title}
                      </span>
                      <span className="text-lg text-slate-500">
                        {isOpen ? "-" : "+"}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="space-y-2 border-t border-slate-200 px-5 py-4">
                        {section.content.map((line) => (
                          <p
                            className="text-sm leading-6 text-slate-600"
                            key={line}
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[22px] border border-slate-200 bg-white/80 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                    Wallet
                  </p>
                  {address && <CopyButton value={address} />}
                </div>
                <p className="mt-3 text-sm text-slate-900">{walletCardValue}</p>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-white/80 p-5">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                  Network
                </p>
                <p className="mt-3 text-sm text-slate-900">
                  {chainStatusValue}
                </p>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-white/80 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                    Contract
                  </p>
                  {contractAddress && <CopyButton value={contractAddress} />}
                </div>
                <p className="mt-3 text-sm text-slate-900">
                  {contractCardValue}
                </p>
              </div>
            </div>
          </div>
        </article>

        <aside className="panel-shadow rounded-[34px] border border-white/70 bg-white/82 p-8 backdrop-blur-xl">
          <SectionHeader
            eyebrow="Demo Flow"
            title="Classroom walkthrough"
            description="A compact sequence for showing why revocation changes the final verification result."
          />
          <div className="mt-6 space-y-4">
            {demoFlow.map((step, index) => (
              <div
                key={step}
                className="flex items-start gap-4 rounded-[22px] border border-slate-100 bg-slate-50/80 p-4"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-900">{step}</p>
                  <p className="mt-1 text-xs leading-6 text-slate-500">
                    {index === 0 &&
                      "Create a record with public certificate fields and an off-chain metadata hash."}
                    {index === 1 &&
                      "Use the same metadata text to show a VALID result."}
                    {index === 2 &&
                      "Send a revoke transaction from the original issuer wallet."}
                    {index === 3 &&
                      "Run verification again: the hash matches, but the status is REVOKED."}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="panel-shadow rounded-[34px] border border-white/70 bg-white/86 p-7 backdrop-blur-xl md:p-8">
          <SectionHeader
            eyebrow="Main Function"
            title="Issue Certificate"
            description="Prepare the record, inspect the generated hash, preview the certificate, then issue the proof on chain."
          />

          {!contractAddress && (
            <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900">
              Deploy CertiChain locally and set `NEXT_PUBLIC_CONTRACT_ADDRESS`
              before issuing certificates.
            </div>
          )}

          {renderWalletWriteNotice("issue")}

          <form className="mt-6 space-y-5" onSubmit={handleIssueSubmit}>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Need a quick classroom example?
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Use sample data to populate a ready-to-demo certificate.
                </p>
              </div>
              <button
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                type="button"
                onClick={handleUseSampleData}
              >
                Use Sample Data
              </button>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Certificate ID
                </span>
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                  value={issueForm.certificateId}
                  onChange={(event) =>
                    handleIssueFieldChange("certificateId", event.target.value)
                  }
                  placeholder="CERT-2026-001"
                />
                <FieldErrorText message={issueErrors.certificateId} />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Recipient Name
                </span>
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                  value={issueForm.recipientName}
                  onChange={(event) =>
                    handleIssueFieldChange("recipientName", event.target.value)
                  }
                  placeholder="Alice Zhang"
                />
                <FieldErrorText message={issueErrors.recipientName} />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Course / Achievement Name
                </span>
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                  value={issueForm.courseName}
                  onChange={(event) =>
                    handleIssueFieldChange("courseName", event.target.value)
                  }
                  placeholder="Blockchain Fundamentals Bootcamp"
                />
                <FieldErrorText message={issueErrors.courseName} />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Issuer Name
                </span>
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                  value={issueForm.issuerName}
                  onChange={(event) =>
                    handleIssueFieldChange("issuerName", event.target.value)
                  }
                  placeholder="CertiChain Academy"
                />
                <FieldErrorText message={issueErrors.issuerName} />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Metadata Text
              </span>
              <textarea
                className="mt-2 min-h-[158px] w-full rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                value={issueForm.metadataText}
                onChange={(event) =>
                  handleIssueFieldChange("metadataText", event.target.value)
                }
                placeholder={`Recipient: Alice Zhang
Program: Blockchain Fundamentals Bootcamp
Completion Date: 2026-04-16`}
              />
              <FieldErrorText message={issueErrors.metadataText} />
            </label>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[26px] border border-slate-200 bg-slate-50/90 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                    Computed Metadata Hash
                  </p>
                  {issueMetadataHash && <CopyButton value={issueMetadataHash} />}
                </div>
                <p className="mt-3 break-all font-mono text-[13px] text-slate-700">
                  {issueMetadataHash ||
                    "Type metadata text to compute the hash locally in the browser."}
                </p>
              </div>

              <div className="rounded-[26px] border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                  Certificate Preview
                </p>
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <p>
                    <span className="font-medium text-slate-900">ID:</span>{" "}
                    {issueForm.certificateId.trim() || "Pending input"}
                  </p>
                  <p>
                    <span className="font-medium text-slate-900">
                      Recipient:
                    </span>{" "}
                    {issueForm.recipientName.trim() || "Pending input"}
                  </p>
                  <p>
                    <span className="font-medium text-slate-900">Course:</span>{" "}
                    {issueForm.courseName.trim() || "Pending input"}
                  </p>
                  <p>
                    <span className="font-medium text-slate-900">Issuer:</span>{" "}
                    {issueForm.issuerName.trim() || "Pending input"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[26px] border border-slate-200 bg-slate-50/90 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {issueStatusTitle}
                  </p>
                  <p className="mt-1 text-xs leading-6 text-slate-500">
                    {issueStatusDescription}
                  </p>
                </div>
                {issueTransactionHash && (
                  <CopyButton value={issueTransactionHash} label="Copy Tx Hash" />
                )}
              </div>

              <TransactionProgress
                successLabel="Certificate issued successfully"
                stage={issueStage}
                transactionHash={issueTransactionHash}
              />
            </div>

            <button
              className="w-full rounded-full bg-slate-950 px-6 py-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={
                !contractAddress ||
                !address ||
                isWrongNetwork ||
                issueLoading
              }
            >
              {issueLoading
                ? "Issuing Certificate On Chain..."
                : "Issue Certificate"}
            </button>
          </form>
        </article>

        <article className="panel-shadow rounded-[34px] border border-white/70 bg-white/86 p-7 backdrop-blur-xl md:p-8">
          <SectionHeader
            eyebrow="Main Function"
            title="Verify Certificate"
            description="Recreate the hash from metadata text and report whether the certificate is valid, revoked, mismatched, or missing."
          />

          <form className="mt-6 space-y-5" onSubmit={handleVerifySubmit}>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Certificate ID
              </span>
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                value={verifyForm.certificateId}
                onChange={(event) =>
                  handleVerifyFieldChange("certificateId", event.target.value)
                }
                placeholder="CERT-2026-001"
              />
              <FieldErrorText message={verifyErrors.certificateId} />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Metadata Text
              </span>
              <textarea
                className="mt-2 min-h-[182px] w-full rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                value={verifyForm.metadataText}
                onChange={(event) =>
                  handleVerifyFieldChange("metadataText", event.target.value)
                }
                placeholder="Paste the original metadata text to reproduce the same hash."
              />
              <FieldErrorText message={verifyErrors.metadataText} />
            </label>

            <div className="rounded-[26px] border border-slate-200 bg-slate-50/90 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                  Metadata Hash
                </p>
                {verifyMetadataHash && <CopyButton value={verifyMetadataHash} />}
              </div>
              <p className="mt-3 break-all font-mono text-[13px] text-slate-700">
                {verifyMetadataHash ||
                  "The same local hashing rule will be applied here before verification."}
              </p>
              <p className="mt-3 text-xs leading-6 text-slate-500">
                After a valid check, change one word or date to show a hash
                mismatch, then revoke and verify again to show REVOKED.
              </p>
            </div>

            {latestIssued && (
              <div className="rounded-[26px] border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Shortcut for live demos
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Load the latest locally stored issuance data into this
                      verify form.
                    </p>
                  </div>
                  <button
                    className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    type="button"
                    onClick={handleLoadLatestIntoVerify}
                  >
                    Use Latest Issued Data
                  </button>
                </div>
              </div>
            )}

            {verifyError && (
              <p className="text-sm text-rose-600">{verifyError}</p>
            )}

            <button
              className="w-full rounded-full bg-emerald-600 px-6 py-4 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={!contractAddress || verifyLoading}
            >
              {verifyLoading ? "Verifying Certificate..." : "Verify Certificate"}
            </button>

            <p className="text-xs leading-6 text-slate-500">
              Verification uses the configured demo RPC, so it can run even if
              MetaMask is disconnected.
            </p>
          </form>
        </article>
      </section>

      <section className="panel-shadow rounded-[34px] border border-white/70 bg-white/86 p-7 backdrop-blur-xl md:p-8">
        <SectionHeader
          eyebrow="Main Function"
          title="Revoke Certificate"
          description="Mark an issued certificate as revoked. The original issuer wallet must submit this transaction."
        />

        {!contractAddress && (
          <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900">
            Deploy CertiChain locally and set `NEXT_PUBLIC_CONTRACT_ADDRESS`
            before revoking certificates.
          </div>
        )}

        {renderWalletWriteNotice("revoke")}

        <form
          className="mt-6 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]"
          onSubmit={handleRevokeSubmit}
        >
          <div className="space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Certificate ID
              </span>
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                value={revokeForm.certificateId}
                onChange={(event) =>
                  handleRevokeFieldChange("certificateId", event.target.value)
                }
                placeholder="CERT-2026-001"
              />
              <FieldErrorText message={revokeErrors.certificateId} />
            </label>

            {latestIssued && (
              <button
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                type="button"
                onClick={handleLoadLatestIntoRevoke}
              >
                Use Latest Issued Certificate
              </button>
            )}

            <button
              className="w-full rounded-full bg-amber-600 px-6 py-4 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={
                !contractAddress ||
                !address ||
                isWrongNetwork ||
                revokeLoading
              }
            >
              {revokeLoading
                ? "Revoking Certificate On Chain..."
                : "Revoke Certificate"}
            </button>
          </div>

          <div className="rounded-[26px] border border-slate-200 bg-slate-50/90 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {revokeStatusTitle}
                </p>
                <p className="mt-1 text-xs leading-6 text-slate-500">
                  {revokeStatusDescription}
                </p>
              </div>
              {revokeTransactionHash && (
                <CopyButton value={revokeTransactionHash} label="Copy Tx Hash" />
              )}
            </div>

            <TransactionProgress
              successLabel="Certificate revoked successfully"
              stage={revokeStage}
              transactionHash={revokeTransactionHash}
            />

            {revokePanel && (
              <div className="mt-5 rounded-[22px] border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">Revoked certificate</p>
                    <p className="mt-2">
                      {revokePanel.certificate.certificateId} was revoked at{" "}
                      {formatPanelTimestamp(revokePanel.revokedAt)}.
                    </p>
                  </div>
                  <CopyButton
                    value={revokePanel.transactionHash}
                    label="Copy Tx Hash"
                  />
                </div>
              </div>
            )}
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Result Panels
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Certificate Status and Verification Result
          </h3>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <article className="panel-shadow rounded-[34px] border border-white/70 bg-white/86 p-7 backdrop-blur-xl md:p-8 xl:col-span-1">
            <SectionHeader
              eyebrow="Result"
              title="Latest Issued Certificate"
              description="The latest locally captured issuance updates after issue and revoke transactions."
            />

            <div className="mt-6">
              {latestIssued ? (
                <div className="space-y-4">
                  <div
                    className={`rounded-[28px] border p-5 ${
                      latestIssued.certificate.revoked
                        ? "border-amber-200 bg-amber-50/80"
                        : "border-emerald-200 bg-emerald-50/70"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Latest issuance captured
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Stored locally at{" "}
                          {formatPanelTimestamp(latestIssued.storedAt)}.
                        </p>
                      </div>
                      <CertificateStatusPill
                        revoked={latestIssued.certificate.revoked}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <DetailRow
                      label="Certificate ID"
                      value={latestIssued.certificate.certificateId}
                    />
                    <DetailRow
                      label="Recipient"
                      value={latestIssued.certificate.recipientName}
                    />
                    <DetailRow
                      label="Course"
                      value={latestIssued.certificate.courseName}
                    />
                    <DetailRow
                      label="Issuer Wallet"
                      value={latestIssued.certificate.issuerWallet}
                      mono
                      copyValue={latestIssued.certificate.issuerWallet}
                    />
                    <DetailRow
                      label="Issue Time"
                      value={formatIssueTime(
                        latestIssued.certificate.issueTime,
                      )}
                    />
                    <DetailRow
                      label="Revoke Time"
                      value={formatOptionalChainTime(
                        latestIssued.certificate.revokedAt,
                      )}
                    />
                    <DetailRow
                      label="Metadata Hash"
                      value={latestIssued.certificate.metadataHash}
                      mono
                      copyValue={latestIssued.certificate.metadataHash}
                    />
                  </div>
                </div>
              ) : (
                <ResultPlaceholder
                  title="No certificate has been issued in this browser session yet."
                  description="Issue a sample certificate above. Once the transaction is confirmed, its details will appear here."
                />
              )}
            </div>
          </article>

          <article className="panel-shadow rounded-[34px] border border-white/70 bg-white/86 p-7 backdrop-blur-xl md:p-8 xl:col-span-2">
            <SectionHeader
              eyebrow="Result"
              title="Verification Result"
              description="This panel separates existence, hash match, revoke state, and final validity."
            />

            <div className="mt-6">
              {verificationPanel ? (
                <div className="space-y-4">
                  <div
                    className={`rounded-[28px] border p-5 ${getStatusClasses(
                      statusContent[verificationPanel.status].tone,
                    )}`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.3em]">
                      Certificate Status
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                      <p className="text-4xl font-semibold tracking-tight">
                        {statusContent[verificationPanel.status].label}
                      </p>
                      <p className="text-xs text-slate-500">
                        Checked at{" "}
                        {formatPanelTimestamp(verificationPanel.checkedAt)}
                      </p>
                    </div>
                    <p className="mt-4 text-sm leading-6">
                      {statusContent[verificationPanel.status].description}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailRow
                      label="Certificate ID"
                      value={verificationPanel.certificateId}
                    />
                    <DetailRow
                      label="Final Valid"
                      value={verificationPanel.valid ? "Yes" : "No"}
                    />
                    <DetailRow
                      label="Hash Match"
                      value={verificationPanel.hashMatches ? "Yes" : "No"}
                    />
                    <DetailRow
                      label="Revoked"
                      value={verificationPanel.revoked ? "Yes" : "No"}
                    />
                    <DetailRow
                      label="Submitted Metadata Hash"
                      value={verificationPanel.metadataHash}
                      mono
                      copyValue={verificationPanel.metadataHash}
                    />
                    {verificationPanel.certificate && (
                      <DetailRow
                        label="On-chain Metadata Hash"
                        value={verificationPanel.certificate.metadataHash}
                        mono
                        copyValue={verificationPanel.certificate.metadataHash}
                      />
                    )}
                  </div>

                  {verificationPanel.certificate ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <DetailRow
                        label="Recipient"
                        value={verificationPanel.certificate.recipientName}
                      />
                      <DetailRow
                        label="Course"
                        value={verificationPanel.certificate.courseName}
                      />
                      <DetailRow
                        label="Issuer"
                        value={verificationPanel.certificate.issuerName}
                      />
                      <DetailRow
                        label="Issuer Wallet"
                        value={verificationPanel.certificate.issuerWallet}
                        mono
                        copyValue={verificationPanel.certificate.issuerWallet}
                      />
                      <DetailRow
                        label="Issue Time"
                        value={formatIssueTime(
                          verificationPanel.certificate.issueTime,
                        )}
                      />
                      <DetailRow
                        label="Revoke Time"
                        value={formatOptionalChainTime(
                          verificationPanel.certificate.revokedAt,
                        )}
                      />
                    </div>
                  ) : (
                    <div className="rounded-[28px] border border-slate-100 bg-white p-5 text-sm text-slate-600">
                      <p className="font-medium text-slate-900">
                        Why no certificate details are shown
                      </p>
                      <p className="mt-2 leading-6">
                        CertiChain only returns full details for certificate IDs
                        that exist on chain. Check the ID or issue a new record
                        first.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <ResultPlaceholder
                  title="No verification has been run yet."
                  description="After you submit the verify form, the result panel will show Valid, Revoked, Hash Mismatch, or Not Found with supporting fields."
                />
              )}
            </div>
          </article>
        </div>
      </section>

      <footer className="rounded-[28px] border border-white/70 bg-white/70 px-6 py-5 text-center text-sm text-slate-500 backdrop-blur-xl">
        CertiChain course demo. Local Hardhat network, MetaMask for writes,
        Next.js frontend, and on-chain metadata hashes for authenticity checks.
      </footer>
    </div>
  );
};

export { CertiChainDemo };
