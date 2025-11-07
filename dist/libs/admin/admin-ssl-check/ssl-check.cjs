"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// libs/admin/admin-ssl-check/src/lib/check.ts
var check_exports = {};
__export(check_exports, {
  checkCertificate: () => checkCertificate,
  formatCertCheckResult: () => formatCertCheckResult,
  getCertInfo: () => getCertInfo
});
module.exports = __toCommonJS(check_exports);
var tls = __toESM(require("node:tls"));
async function getCertInfo(hostname, options = {}) {
  const port = options.port ?? 443;
  const timeout = options.timeout ?? 1e4;
  const servername = options.servername ?? hostname;
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host: hostname, port, servername },
      () => {
        const cert = socket.getPeerCertificate(true);
        if (!cert || Object.keys(cert).length === 0) {
          socket.destroy();
          reject(new Error("No certificate returned"));
          return;
        }
        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const issuer = cert.issuer?.CN || JSON.stringify(cert.issuer);
        const subject = cert.subject?.CN || JSON.stringify(cert.subject);
        const sanRaw = cert.subjectaltname || "";
        const subjectAltNames = sanRaw.split(", ").map((s) => s.replace(/^DNS:/, "")).filter(Boolean);
        socket.destroy();
        resolve({
          validFrom,
          validTo,
          issuer,
          subject,
          subjectAltNames
        });
      }
    );
    socket.on("error", (err) => {
      socket.destroy();
      reject(err);
    });
    socket.setTimeout(timeout, () => {
      socket.destroy();
      reject(new Error(`Connection timeout after ${timeout}ms`));
    });
  });
}
async function checkCertificate(hostname, options = {}) {
  const port = options.port ?? 443;
  const warnings = [];
  const errors = [];
  try {
    const info = await getCertInfo(hostname, options);
    const now = /* @__PURE__ */ new Date();
    const daysLeft = Math.floor(
      (info.validTo.getTime() - now.getTime()) / (1e3 * 60 * 60 * 24)
    );
    if (info.validTo < now) {
      errors.push(`Certificate expired on ${info.validTo.toISOString()}`);
    }
    if (daysLeft < 14 && daysLeft >= 0) {
      warnings.push(
        `Certificate expires in ${daysLeft} days \u2014 consider renewal`
      );
    }
    const hostnameLower = hostname.toLowerCase();
    const sanLower = info.subjectAltNames.map((s) => s.toLowerCase());
    if (!sanLower.includes(hostnameLower)) {
      warnings.push(
        `Hostname ${hostname} not in SAN list: ${info.subjectAltNames.join(", ")}`
      );
    }
    if (info.validFrom > now) {
      warnings.push(
        `Certificate not yet valid (valid from ${info.validFrom.toISOString()})`
      );
    }
    return {
      hostname,
      port,
      isValid: errors.length === 0 && info.validTo >= now,
      daysUntilExpiry: daysLeft,
      expiresSoon: daysLeft < 14 && daysLeft >= 0,
      info,
      warnings,
      errors
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Failed to retrieve certificate: ${errorMessage}`);
    return {
      hostname,
      port,
      isValid: false,
      daysUntilExpiry: -1,
      expiresSoon: false,
      info: {
        validFrom: /* @__PURE__ */ new Date(),
        validTo: /* @__PURE__ */ new Date(),
        issuer: "unknown",
        subject: "unknown",
        subjectAltNames: []
      },
      warnings,
      errors
    };
  }
}
function formatCertCheckResult(result) {
  const lines = [];
  lines.push(`
Certificate Status for ${result.hostname}:${result.port}`);
  lines.push("\u2500".repeat(50));
  if (result.errors.length > 0) {
    lines.push("\u274C ERRORS:");
    result.errors.forEach((err) => lines.push(`   ${err}`));
  }
  if (result.warnings.length > 0) {
    lines.push("\u26A0\uFE0F  WARNINGS:");
    result.warnings.forEach((warn) => lines.push(`   ${warn}`));
  }
  if (result.isValid && result.errors.length === 0) {
    lines.push("\u2714 Certificate is valid");
  }
  lines.push(`
Issuer: ${result.info.issuer}`);
  lines.push(`Subject: ${result.info.subject}`);
  lines.push(`Valid from: ${result.info.validFrom.toISOString()}`);
  lines.push(`Valid to:   ${result.info.validTo.toISOString()}`);
  if (result.daysUntilExpiry >= 0) {
    lines.push(`Days until expiry: ${result.daysUntilExpiry}`);
  } else if (result.daysUntilExpiry < 0 && result.info.validTo < /* @__PURE__ */ new Date()) {
    lines.push(`Certificate expired ${Math.abs(result.daysUntilExpiry)} days ago`);
  }
  if (result.info.subjectAltNames.length > 0) {
    lines.push(`Subject Alternative Names: ${result.info.subjectAltNames.join(", ")}`);
  }
  return lines.join("\n");
}
if (require.main === module) {
  const hostname = process.argv[2];
  const portArg = process.argv[3];
  if (!hostname) {
    console.error("Usage: ssl-check <hostname> [port]");
    process.exit(1);
  }
  const options = {};
  if (portArg) {
    const port = parseInt(portArg, 10);
    if (isNaN(port)) {
      console.error(`Invalid port: ${portArg}`);
      process.exit(1);
    }
    options.port = port;
  }
  checkCertificate(hostname, options).then((result) => {
    console.log(formatCertCheckResult(result));
    process.exit(result.isValid ? 0 : 1);
  }).catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  checkCertificate,
  formatCertCheckResult,
  getCertInfo
});
