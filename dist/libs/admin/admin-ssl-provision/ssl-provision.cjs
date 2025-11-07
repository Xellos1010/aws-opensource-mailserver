"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// libs/admin/admin-ssl-provision/src/lib/provision.ts
var provision_exports = {};
__export(provision_exports, {
  checkDomainsNeedingCertificates: () => checkDomainsNeedingCertificates,
  deployCertificate: () => deployCertificate,
  provisionCertificate: () => provisionCertificate
});
module.exports = __toCommonJS(provision_exports);
async function provisionCertificate(options) {
  console.log("SSL Certificate Provisioning (Scaffolded)");
  console.log("Domains:", options.domains.join(", "));
  console.log("Email:", options.email || "not specified");
  console.log("Challenge Type:", options.challengeType || "http-01");
  console.log("\n\u26A0\uFE0F  This is a scaffolded implementation.");
  console.log("   Full implementation will be added when EMC-Notary server is ready.\n");
  return {
    success: false,
    domains: options.domains,
    certificates: options.domains.map((domain) => ({
      domain,
      status: "skipped",
      error: "Not yet implemented"
    }))
  };
}
async function checkDomainsNeedingCertificates(domains) {
  console.log("Checking domains for certificate provisioning...");
  console.log("Domains:", domains.join(", "));
  console.log("\n\u26A0\uFE0F  This is a scaffolded implementation.\n");
  return [];
}
async function deployCertificate(domain, certPath, targetPath) {
  console.log(`Deploying certificate for ${domain}`);
  console.log(`From: ${certPath}`);
  console.log(`To: ${targetPath}`);
  console.log("\n\u26A0\uFE0F  This is a scaffolded implementation.\n");
}
if (require.main === module) {
  const domains = process.argv.slice(2);
  if (domains.length === 0) {
    console.error("Usage: ssl-provision <domain1> [domain2 ...]");
    process.exit(1);
  }
  provisionCertificate({
    domains,
    email: process.env["ACME_EMAIL"],
    challengeType: process.env["ACME_CHALLENGE_TYPE"] || "http-01"
  }).then((result) => {
    console.log("Provision result:", JSON.stringify(result, null, 2));
    process.exit(0);
  }).catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  checkDomainsNeedingCertificates,
  deployCertificate,
  provisionCertificate
});
