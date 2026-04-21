// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title CertiChain
 * @author CertiChain Demo
 * @notice Simple certificate registry for classroom demos.
 * @dev The full certificate file stays off-chain. Only a reproducible metadata hash is stored
 *      on-chain as a tamper-resistant authenticity anchor.
 */
contract CertiChain {
    struct Certificate {
        string certificateId;
        string recipientName;
        string courseName;
        string issuerName;
        string metadataHash;
        address issuerWallet;
        uint256 issueTime;
        bool isValid;
    }

    mapping(string => Certificate) private certificates;

    event CertificateIssued(
        string indexed certificateId,
        string recipientName,
        string courseName,
        string issuerName,
        string metadataHash,
        address indexed issuerWallet,
        uint256 issueTime
    );

    /**
     * @notice Issues a new certificate record.
     * @dev `metadataHash` should be created off-chain from certificate metadata for demo purposes.
     */
    function issueCertificate(
        string calldata certificateId,
        string calldata recipientName,
        string calldata courseName,
        string calldata issuerName,
        string calldata metadataHash
    ) external {
        require(bytes(certificateId).length > 0, "Certificate ID required");
        require(bytes(recipientName).length > 0, "Recipient name required");
        require(bytes(courseName).length > 0, "Course name required");
        require(bytes(issuerName).length > 0, "Issuer name required");
        require(bytes(metadataHash).length > 0, "Metadata hash required");
        require(!_certificateExists(certificateId), "Certificate already exists");

        certificates[certificateId] = Certificate({
            certificateId: certificateId,
            recipientName: recipientName,
            courseName: courseName,
            issuerName: issuerName,
            metadataHash: metadataHash,
            issuerWallet: msg.sender,
            issueTime: block.timestamp,
            isValid: true
        });

        emit CertificateIssued(
            certificateId,
            recipientName,
            courseName,
            issuerName,
            metadataHash,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Verifies whether a certificate exists and matches the supplied hash.
     */
    function verifyCertificate(
        string calldata certificateId,
        string calldata metadataHash
    ) external view returns (bool) {
        if (!_certificateExists(certificateId)) {
            return false;
        }

        Certificate storage certificate = certificates[certificateId];

        if (!certificate.isValid) {
            return false;
        }

        return
            keccak256(bytes(certificate.metadataHash)) ==
            keccak256(bytes(metadataHash));
    }

    /**
     * @notice Returns a stored certificate.
     */
    function getCertificate(
        string calldata certificateId
    )
        external
        view
        returns (
            string memory storedCertificateId,
            string memory recipientName,
            string memory courseName,
            string memory issuerName,
            string memory metadataHash,
            address issuerWallet,
            uint256 issueTime,
            bool isValid
        )
    {
        require(_certificateExists(certificateId), "Certificate not found");

        Certificate storage certificate = certificates[certificateId];

        return (
            certificate.certificateId,
            certificate.recipientName,
            certificate.courseName,
            certificate.issuerName,
            certificate.metadataHash,
            certificate.issuerWallet,
            certificate.issueTime,
            certificate.isValid
        );
    }

    function _certificateExists(
        string memory certificateId
    ) internal view returns (bool) {
        return bytes(certificates[certificateId].certificateId).length > 0;
    }
}
