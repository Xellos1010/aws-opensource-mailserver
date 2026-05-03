# Documentation: Certificates API

**URL:** https://developer.godaddy.com/doc/endpoint/certificates

**Documentation Name:** Certificates API

**Endpoints Found:** 25

**Endpoints Expanded:** 25

**Endpoints Extracted:** 25

---

## API Endpoints

### POST /v1/certificates

**Name:** /v1/certificates

**Description:** Creating a certificate order can be a long running asynchronous operation in the PKI workflow. The PKI API supports 2 options for getting the completion stateful actions for this asynchronous operations: 1) by polling operations -- see /v1/certificates/{certificateId}/actions 2) via WebHook style callback -- see '/v1/certificates/{certificateId}/callback'.

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Market-Id | string | Setting locale for communications such as emails and error messages | No | header |
| certificateCreate | string | The certificate order information | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "callbackUrl": "string",
  "commonName": "string",
  "contact": {
    "email": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "phone": "string",
    "suffix": "string"
  },
  "csr": "string",
  "intelVPro": false,
  "organization": {
    "address": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "AC",
      "postalCode": "string",
      "state": "string"
    },
    "assumedName": "string",
    "name": "string",
    "phone": "string",
    "registrationAgent": "string",
    "registrationNumber": "string"
  },
  "period": 0,
  "productType": "DV_SSL",
  "rootType": "STARFIELD_SHA_2",
  "slotSize": "FIVE",
  "subjectAlternativeNames": [
    "string"
  ]
}
```

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 409 | Certificate state does not allow renew |
| 422 | email is not emptycsr is invalid |
| 500 | Internal server error |

---

### POST /v1/certificates/validate

**Name:** /v1/certificates/validate

**Description:** POST/v1/certificates/validateValidate a pending order for certificate

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Market-Id | string | Setting locale for communications such as emails and error messages | No | header |
| certificateCreate | string | The certificate order info | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "callbackUrl": "string",
  "commonName": "string",
  "contact": {
    "email": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "phone": "string",
    "suffix": "string"
  },
  "csr": "string",
  "intelVPro": false,
  "organization": {
    "address": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "AC",
      "postalCode": "string",
      "state": "string"
    },
    "assumedName": "string",
    "name": "string",
    "phone": "string",
    "registrationAgent": "string",
    "registrationNumber": "string"
  },
  "period": 0,
  "productType": "DV_SSL",
  "rootType": "STARFIELD_SHA_2",
  "slotSize": "FIVE",
  "subjectAlternativeNames": [
    "string"
  ]
}
```

#### Responses

| Code | Description |
|------|-------------|
| 204 | Request validated successfully |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 409 | Certificate state does not allow renew |
| 422 | email is not empty  csr is invalid |
| 500 | Internal server error |

---

### GET /v1/certificates/{certificateId}

**Name:** /v1/certificates/{certificateId}

**Description:** Once the certificate order has been created, this method can be used to check the status of the certificate. This method can also be used to retrieve details of the certificate.

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| certificateId | string | Certificate id to lookup | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Certificate details retrieved |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Certificate id not found |
| 500 | Internal server error |

---

### GET /v1/certificates/{certificateId}/actions

**Name:** /v1/certificates/{certificateId}/actions

**Description:** This method is used to retrieve all stateful actions relating to a certificate lifecycle.

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| certificateId | string | Certificate id to register for callback | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Action retrieval successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Certificate not found |
| 500 | Internal server error |

---

### POST /v1/certificates/{certificateId}/email/{emailId}/resend

**Name:** /v1/certificates/{certificateId}/email/{emailId}/resend

**Description:** This method can be used to resend emails by providing the certificate id and the email id

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| certificateId | string | Certificate id to resend email | Yes | path |
| emailId | string | Email id for email to resend | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 204 | Email sent successfully |
| 404 | Certificate not found |
| 409 | Email Id not found |
| 500 | Internal server error |

---

### POST /v1/certificates/{certificateId}/email/resend/{emailAddress}

**Name:** /v1/certificates/{certificateId}/email/resend/{emailAddress}

**Description:** This method adds an alternate email address to a certificate order and re-sends all existing request emails to that address.

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| certificateId | string | Certificate id to resend emails | Yes | path |
| emailAddress | string | Specific email address to resend email | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Alternate email address added and emails re-sent |
| 404 | Certificate not found |
| 409 | Certificate state does not allow alternate email address |
| 500 | Internal server error |

---

### POST /v1/certificates/{certificateId}/email/{emailId}/resend/{emailAddress}

**Name:** /v1/certificates/{certificateId}/email/{emailId}/resend/{emailAddress}

**Description:** This method can be used to resend emails by providing the certificate id, the email id, and the recipient email address

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| certificateId | string | Certificate id to resend emails | Yes | path |
| emailId | string | Email id for email to resend | Yes | path |
| emailAddress | string | Specific email address to resend email | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 204 | Email sent successfully |
| 404 | Certificate not found |
| 409 | Email Id not found |
| 500 | Internal server error |

---

### GET /v1/certificates/{certificateId}/email/history

**Name:** /v1/certificates/{certificateId}/email/history

**Description:** This method can be used to retrieve all emails sent for a certificate.

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| certificateId | string | Certificate id to retrieve email history | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Email history retrieval successful |
| 409 | Email history not found |
| 500 | Internal server error |

---

### DELETE /v1/certificates/{certificateId}/callback

**Name:** /v1/certificates/{certificateId}/callback

**Description:** Unregister the callback for a particular certificate.

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| certificateId | string | Certificate id to unregister callback | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 204 | Callback removed |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Certificate id not found |
| 500 | Internal server error |

---

### GET /v1/certificates/{certificateId}/callback

**Name:** /v1/certificates/{certificateId}/callback

**Description:** This method is used to retrieve the registered callback url for a certificate.

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| certificateId | string | Certificate id to register for stateful action callback | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Callback registered |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Certificate id not found |
| 500 | Internal server error |

---

### PUT /v1/certificates/{certificateId}/callback

**Name:** /v1/certificates/{certificateId}/callback

**Description:** This method is used to register/replace url for callbacks for stateful actions relating to a certificate lifecycle. The callback url is a Webhook style pattern and will receive POST http requests with json body defined in the CertificateAction model definition for each certificate action.  Only one callback URL is allowed to be registered for each certificateId, so it will replace a previous registration.

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| certificateId | string | Certificate id to register/replace for callback | Yes | path |
| callbackUrl | string | Callback url registered/replaced to receive stateful actions | Yes | query |

#### Responses

| Code | Description |
|------|-------------|
| 204 | Callback replaced/registered |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Certificate id not found |
| 422 | Callback url is missing  Callback url is malformed |
| 500 | Internal server error |

---

### POST /v1/certificates/{certificateId}/cancel

**Name:** /v1/certificates/{certificateId}/cancel

**Description:** Use the cancel call to cancel a pending certificate order.

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| certificateId | string | Certificate id to cancel | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 204 | Certificate order has been canceled |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Certificate id not found |
| 409 | Certificate state does not allow cancel |
| 500 | Internal server error |

---

### GET /v1/certificates/{certificateId}/download

**Name:** /v1/certificates/{certificateId}/download

**Description:** GET/v1/certificates/{certificateId}/downloadDownload certificate

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| certificateId | string | Certificate id to download | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Certificate retrieved |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Certificate id not found |
| 409 | Certificate state does not allow download |
| 500 | Internal server error |

---

### POST /v1/certificates/{certificateId}/reissue

**Name:** /v1/certificates/{certificateId}/reissue

**Description:** Rekeying is the process by which the private and public key is changed for a certificate. It is a simplified reissue,where only the CSR is changed. Reissuing is the process by which domain names are added or removed from a certificate.Once a request is validated and approved, the certificate will be reissued with the new common name and sans specified. Unlimited reissues are available during the lifetime of the certificate.New names added to a certificate that do not share the base domain of the common name may take additional time to validate. If this API call is made before a previous pending reissue has been validated and issued, the previous reissue request is automatically rejected and replaced with the current request.

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| certificateId | string | Certificate id to reissue | Yes | path |
| reissueCreate | string | The reissue request info | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "callbackUrl": "string",
  "commonName": "Existing common name",
  "csr": "Existing CSR",
  "delayExistingRevoke": 72,
  "rootType": "GODADDY_SHA_1",
  "subjectAlternativeNames": [
    "string"
  ],
  "forceDomainRevetting": [
    "string"
  ]
}
```

#### Responses

| Code | Description |
|------|-------------|
| 202 | Reissue request created |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Certificate id not found |
| 409 | Certificate state does not allow reissue |
| 422 | csr is invalidDelay revocation exceeds maximum |
| 500 | Internal server error |

---

### POST /v1/certificates/{certificateId}/renew

**Name:** /v1/certificates/{certificateId}/renew

**Description:** Renewal is the process by which the validity of a certificate is extended. Renewal is only available 60 days prior to expiration of the previous certificate and 30 days after the expiration of the previous certificate. The renewal supports modifying a set of the original certificate order information. Once a request is validated and approved, the certificate will be issued with extended validity. Since subject alternative names can be removed during a renewal, we require that you provide the subject alternative names you expect in the renewed certificate. New names added to a certificate that do not share the base domain of the common name may take additional time to validate.

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| certificateId | string | Certificate id to renew | Yes | path |
| renewCreate | string | The renew request info | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "callbackUrl": "string",
  "commonName": "Existing common name",
  "csr": "Existing CSR",
  "period": 0,
  "rootType": "GODADDY_SHA_1",
  "subjectAlternativeNames": [
    "string"
  ]
}
```

#### Responses

| Code | Description |
|------|-------------|
| 202 | Renew request created |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Certificate id not found |
| 409 | Certificate state does not allow renew |
| 422 | csr is invalid |
| 500 | Internal server error |

---

### POST /v1/certificates/{certificateId}/revoke

**Name:** /v1/certificates/{certificateId}/revoke

**Description:** Use revoke call to revoke an active certificate, if the certificate has not been issued a 404 response will be returned.

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| certificateId | string | Certificate id to revoke | Yes | path |
| certificateRevoke | string | The certificate revocation request | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "reason": "AFFILIATION_CHANGED"
}
```

#### Responses

| Code | Description |
|------|-------------|
| 204 | Certificate Revoked |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Certificate id not found |
| 409 | Certificate state does not allow revoke |
| 500 | Internal server error |

---

### GET /v1/certificates/{certificateId}/siteSeal

**Name:** /v1/certificates/{certificateId}/siteSeal

**Description:** This method is used to obtain the site seal information for an issued certificate. A site seal is a graphic that the certificate purchaser can embed on their web site to show their visitors information about their SSL certificate. If a web site visitor clicks on the site seal image, a pop-up page is displayed that contains detailed information about the SSL certificate. The site seal token is used to link the site seal graphic image to the appropriate certificate details pop-up page display when a user clicks on the site seal. The site seal images are expected to be static images and hosted on the reseller's website, to minimize delays for customer page load times.

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| certificateId | string | Certificate id | Yes | path |
| theme | string | This value represents the visual theme of the seal. If seal doesn't exist, default values are used if params not present. If seal does exist, default values will not be used to update unless params present. | No | query |
| locale | string | Determine locale for text displayed in seal image and verification page. If seal doesn't exist, default values are used if params not present. If seal does exist, default values will not be used to update unless params present. | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Site seal retrieved |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Certificate id not found |
| 409 | Certificate state does not allow seal |
| 422 | 'locale' is invalid |
| 500 | Internal server error |

---

### POST /v1/certificates/{certificateId}/verifyDomainControl

**Name:** /v1/certificates/{certificateId}/verifyDomainControl

**Description:** Domain control is a means for verifying the domain included in the certificate order. This resource is useful for resellers that control the domains for their customers, and can expedite the verification process. See https://www.godaddy.com/help/verifying-your-domain-ownership-for-ssl-certificate-requests-html-or-dns-7452

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| certificateId | string | Certificate id to lookup | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 204 | Domain control was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Certificate id not found |
| 409 | Domain control was not successful  Certificate state does not allow domain control |
| 500 | Internal server error |

---

### GET /v2/certificates

**Name:** /v2/certificates

**Description:** Once the certificate order has been created, this method can be used to check the status of the certificate. This method can also be used to retrieve details of the certificates associated to an entitlement.

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| entitlementId | string | Entitlement id to lookup | Yes | query |
| latest | boolean | Fetch only the most recent certificate | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Certificate details retrieved |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 422 | Entitlement id not provided |
| 500 | Internal server error |

---

### GET /v2/certificates/download

**Name:** /v2/certificates/download

**Description:** GET/v2/certificates/downloadDownload certificate by entitlement

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| entitlementId | string | Entitlement id to download | Yes | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Certificate retrieved |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Entitlement id not found |
| 409 | Certificate state does not allow download |
| 422 | Entitlement id not provided |
| 500 | Internal server error |

---

### GET /v2/customers/{customerId}/certificates

**Name:** /v2/customers/{customerId}/certificates

**Description:** This method can be used to retrieve a list of certificates for a specified customer. shopperId is not the same as customerId.  shopperId is a number of max length 10 digits (ex: 1234567890) whereas customerId is a UUIDv4 (ex: 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

**Tag:** v2

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| customerId | string | An identifier for a customer | Yes | path |
| offset | integer($integer-positive) | Number of results to skip for pagination | No | query |
| limit | integer($integer-positive) | Maximum number of items to return | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Customer certificate information retrieved. |
| 401 | Authentication info not sent or is invalid |
| 403 | Authenticated user is not allowed access |
| 422 | Application-specific request error |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v2/customers/{customerId}/certificates/{certificateId}

**Name:** /v2/customers/{customerId}/certificates/{certificateId}

**Description:** Once the certificate order has been created, this method can be used to check the status of the certificate. This method can also be used to retrieve details of the certificate. shopperId is not the same as customerId. shopperId is a number of max length 10 digits (ex: 1234567890) whereas customerId is a UUIDv4 (ex: 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

**Tag:** v2

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| customerId | string | An identifier for a customer | Yes | path |
| certificateId | string | Certificate id to lookup | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Certificate details retrieved |
| 401 | Authentication info not sent or is invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | Application-specific request error |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v2/customers/{customerId}/certificates/{certificateId}/domainVerifications

**Name:** /v2/customers/{customerId}/certificates/{certificateId}/domainVerifications

**Description:** This method can be used to retrieve the domain verification status for a certificate request.shopperId is not the same as customerId.  shopperId is a number of max length 10 digits (ex: 1234567890) whereas customerId is a UUIDv4 (ex: 295e3bc3-b3b9-4d95-aae5-ede41a994d13)"

**Tag:** v2

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| customerId | string | An identifier for a customer | Yes | path |
| certificateId | string | Certificate id to lookup | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Domain verification status list for specified certificateId. |
| 401 | Authentication info not sent or is invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | Application-specific request error |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v2/customers/{customerId}/certificates/{certificateId}/domainVerifications/{domain}

**Name:** /v2/customers/{customerId}/certificates/{certificateId}/domainVerifications/{domain}

**Description:** Retrieve detailed information for supplied domain, including domain verification details and Certificate Authority Authorization (CAA) verification details. shopperId is not the same as customerId.  shopperId is a number of max length 10 digits (ex: 1234567890) whereas customerId is a UUIDv4 (ex: 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

**Tag:** v2

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| customerId | string | An identifier for a customer | Yes | path |
| certificateId | string | Certificate id to lookup | Yes | path |
| domain | string($domain) | A valid domain name in the certificate request | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Retrieve detailed information for supplied domain, including domain verification details and Certificate Authority Authorization (CAA) verification details. |
| 401 | Authentication info not sent or is invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | Application-specific request error |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v2/customers/{customerId}/certificates/acme/externalAccountBinding

**Name:** /v2/customers/{customerId}/certificates/acme/externalAccountBinding

**Description:** Use this endpoint to retrieve a key identifier and Hash-based Message Authentication Code (HMAC) key for Automated Certificate Management Environment (ACME) External Account Binding (EAB). These credentials can be used with an ACME client that supports EAB (ex. CertBot) to automate the issuance request and deployment of DV SSL certificates

**Tag:** v2

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| customerId | string | An identifier for a customer | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Acme key identifier and HMAC key for the external account binding. Directory URI is also provided for making ACME requests. |
| 401 | Authentication info not sent or is invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | Application-specific request error |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

## Full Documentation

# Untitled

### [v1](#/v1)

Creating a certificate order can be a long running asynchronous operation in the PKI workflow. The PKI API supports 2 options for getting the completion stateful actions for this asynchronous operations: 1) by polling operations -- see /v1/certificates/{certificateId}/actions 2) via WebHook style callback -- see '/v1/certificates/{certificateId}/callback'.

Name

Description

X-Market-Id

string

(header)

Setting locale for communications such as emails and error messages

*Default value* : Default locale for shopper account

certificateCreate \*

(body)

The certificate order information

```
{
  "callbackUrl": "string",
  "commonName": "string",
  "contact": {
    "email": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "phone": "string",
    "suffix": "string"
  },
  "csr": "string",
  "intelVPro": false,
  "organization": {
    "address": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "AC",
      "postalCode": "string",
      "state": "string"
    },
    "assumedName": "string",
    "name": "string",
    "phone": "string",
    "registrationAgent": "string",
    "registrationNumber": "string"
  },
  "period": 0,
  "productType": "DV_SSL",
  "rootType": "STARFIELD_SHA_2",
  "slotSize": "FIVE",
  "subjectAlternativeNames": [
    "string"
  ]
}
```

Parameter content type

Code

Description

202

Request was successful

```
{
  "certificateId": "string"
}
```

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

409

Certificate state does not allow renew

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

422

`email` is not empty  
`csr` is invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Market-Id

string

(header)

Setting locale for communications such as emails and error messages

*Default value* : Default locale for shopper account

certificateCreate \*

(body)

The certificate order info

```
{
  "callbackUrl": "string",
  "commonName": "string",
  "contact": {
    "email": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "phone": "string",
    "suffix": "string"
  },
  "csr": "string",
  "intelVPro": false,
  "organization": {
    "address": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "AC",
      "postalCode": "string",
      "state": "string"
    },
    "assumedName": "string",
    "name": "string",
    "phone": "string",
    "registrationAgent": "string",
    "registrationNumber": "string"
  },
  "period": 0,
  "productType": "DV_SSL",
  "rootType": "STARFIELD_SHA_2",
  "slotSize": "FIVE",
  "subjectAlternativeNames": [
    "string"
  ]
}
```

Parameter content type

Code

Description

204

Request validated successfully

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

409

Certificate state does not allow renew

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

422

`email` is not empty  
`csr` is invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

Once the certificate order has been created, this method can be used to check the status of the certificate. This method can also be used to retrieve details of the certificate.

Name

Description

certificateId \*

string

(path)

Certificate id to lookup

Code

Description

200

Certificate details retrieved

```
{
  "certificateId": "string",
  "commonName": "string",
  "contact": {
    "email": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "phone": "string",
    "suffix": "string"
  },
  "createdAt": "string",
  "deniedReason": "string",
  "organization": {
    "address": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "AC",
      "postalCode": "string",
      "state": "string"
    },
    "assumedName": "string",
    "jurisdictionOfIncorporation": {
      "city": "string",
      "country": "string",
      "county": "string",
      "state": "string"
    },
    "name": "string",
    "phone": "string",
    "registrationAgent": "string",
    "registrationNumber": "string"
  },
  "period": 0,
  "productType": "DV_SSL",
  "progress": 0,
  "revokedAt": "string",
  "rootType": "GODADDY_SHA_1",
  "serialNumber": "string",
  "serialNumberHex": "string",
  "slotSize": "FIVE",
  "status": "PENDING_ISSUANCE",
  "subjectAlternativeNames": [
    {
      "status": "PENDING",
      "subjectAlternativeName": "string"
    }
  ],
  "validEnd": "string",
  "validStart": "string"
}
```

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Certificate id not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

This method is used to retrieve all stateful actions relating to a certificate lifecycle.

Name

Description

certificateId \*

string

(path)

Certificate id to register for callback

Code

Description

200

Action retrieval successful

```
[
  {
    "createdAt": "string",
    "type": "CERTIFICATE_ISSUED"
  }
]
```

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Certificate not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

This method can be used to resend emails by providing the certificate id and the email id

Name

Description

certificateId \*

string

(path)

Certificate id to resend email

emailId \*

string

(path)

Email id for email to resend

Code

Description

204

Email sent successfully

404

Certificate not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

409

Email Id not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

This method adds an alternate email address to a certificate order and re-sends all existing request emails to that address.

Name

Description

certificateId \*

string

(path)

Certificate id to resend emails

emailAddress \*

string

(path)

Specific email address to resend email

Code

Description

200

Alternate email address added and emails re-sent

```
{
  "id": 0,
  "accountId": 0,
  "templateType": "string",
  "fromType": "string",
  "recipients": "string",
  "body": "string",
  "dateEntered": "string",
  "subject": "string"
}
```

404

Certificate not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

409

Certificate state does not allow alternate email address

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

This method can be used to resend emails by providing the certificate id, the email id, and the recipient email address

Name

Description

certificateId \*

string

(path)

Certificate id to resend emails

emailId \*

string

(path)

Email id for email to resend

emailAddress \*

string

(path)

Specific email address to resend email

Code

Description

204

Email sent successfully

404

Certificate not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

409

Email Id not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

This method can be used to retrieve all emails sent for a certificate.

Name

Description

certificateId \*

string

(path)

Certificate id to retrieve email history

Code

Description

200

Email history retrieval successful

```
{
  "id": 0,
  "accountId": 0,
  "templateType": "string",
  "fromType": "string",
  "recipients": "string",
  "body": "string",
  "dateEntered": "string",
  "subject": "string"
}
```

409

Email history not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

Unregister the callback for a particular certificate.

Name

Description

certificateId \*

string

(path)

Certificate id to unregister callback

Code

Description

204

Callback removed

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Certificate id not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

This method is used to retrieve the registered callback url for a certificate.

Name

Description

certificateId \*

string

(path)

Certificate id to register for stateful action callback

Code

Description

200

Callback registered

```
{
  "callbackUrl": "string"
}
```

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Certificate id not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

This method is used to register/replace url for callbacks for stateful actions relating to a certificate lifecycle. The callback url is a Webhook style pattern and will receive POST http requests with json body defined in the CertificateAction model definition for each certificate action. Only one callback URL is allowed to be registered for each certificateId, so it will replace a previous registration.

Name

Description

certificateId \*

string

(path)

Certificate id to register/replace for callback

callbackUrl \*

string

(query)

Callback url registered/replaced to receive stateful actions

Code

Description

204

Callback replaced/registered

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Certificate id not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

422

Callback url is missing  
Callback url is malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

Use the cancel call to cancel a pending certificate order.

Name

Description

certificateId \*

string

(path)

Certificate id to cancel

Code

Description

204

Certificate order has been canceled

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Certificate id not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

409

Certificate state does not allow cancel

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

certificateId \*

string

(path)

Certificate id to download

Code

Description

200

Certificate retrieved

```
{
  "pems": {
    "certificate": "string",
    "cross": "string",
    "intermediate": "string",
    "root": "string"
  },
  "serialNumber": "string"
}
```

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Certificate id not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

409

Certificate state does not allow download

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

Rekeying is the process by which the private and public key is changed for a certificate. It is a simplified reissue,where only the CSR is changed. Reissuing is the process by which domain names are added or removed from a certificate.Once a request is validated and approved, the certificate will be reissued with the new common name and sans specified. Unlimited reissues are available during the lifetime of the certificate.New names added to a certificate that do not share the base domain of the common name may take additional time to validate. If this API call is made before a previous pending reissue has been validated and issued, the previous reissue request is automatically rejected and replaced with the current request.

Name

Description

certificateId \*

string

(path)

Certificate id to reissue

reissueCreate \*

(body)

The reissue request info

```
{
  "callbackUrl": "string",
  "commonName": "Existing common name",
  "csr": "Existing CSR",
  "delayExistingRevoke": 72,
  "rootType": "GODADDY_SHA_1",
  "subjectAlternativeNames": [
    "string"
  ],
  "forceDomainRevetting": [
    "string"
  ]
}
```

Parameter content type

Code

Description

202

Reissue request created

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Certificate id not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

409

Certificate state does not allow reissue

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

422

`csr` is invalid  
Delay revocation exceeds maximum

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

Renewal is the process by which the validity of a certificate is extended. Renewal is only available 60 days prior to expiration of the previous certificate and 30 days after the expiration of the previous certificate. The renewal supports modifying a set of the original certificate order information. Once a request is validated and approved, the certificate will be issued with extended validity. Since subject alternative names can be removed during a renewal, we require that you provide the subject alternative names you expect in the renewed certificate. New names added to a certificate that do not share the base domain of the common name may take additional time to validate.

Name

Description

certificateId \*

string

(path)

Certificate id to renew

renewCreate \*

(body)

The renew request info

```
{
  "callbackUrl": "string",
  "commonName": "Existing common name",
  "csr": "Existing CSR",
  "period": 0,
  "rootType": "GODADDY_SHA_1",
  "subjectAlternativeNames": [
    "string"
  ]
}
```

Parameter content type

Code

Description

202

Renew request created

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Certificate id not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

409

Certificate state does not allow renew

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

422

`csr` is invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

Use revoke call to revoke an active certificate, if the certificate has not been issued a 404 response will be returned.

Name

Description

certificateId \*

string

(path)

Certificate id to revoke

certificateRevoke \*

(body)

The certificate revocation request

```
{
  "reason": "AFFILIATION_CHANGED"
}
```

Parameter content type

Code

Description

204

Certificate Revoked

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Certificate id not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

409

Certificate state does not allow revoke

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

This method is used to obtain the site seal information for an issued certificate. A site seal is a graphic that the certificate purchaser can embed on their web site to show their visitors information about their SSL certificate. If a web site visitor clicks on the site seal image, a pop-up page is displayed that contains detailed information about the SSL certificate. The site seal token is used to link the site seal graphic image to the appropriate certificate details pop-up page display when a user clicks on the site seal. The site seal images are expected to be static images and hosted on the reseller's website, to minimize delays for customer page load times.

Name

Description

certificateId \*

string

(path)

Certificate id

theme

string

(query)

This value represents the visual theme of the seal. If seal doesn't exist, default values are used if params not present. If seal does exist, default values will not be used to update unless params present.

*Available values* : DARK, LIGHT

*Default value* : LIGHT

locale

string

(query)

Determine locale for text displayed in seal image and verification page. If seal doesn't exist, default values are used if params not present. If seal does exist, default values will not be used to update unless params present.

*Default value* : en

Code

Description

200

Site seal retrieved

```
{
  "html": "string"
}
```

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Certificate id not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

409

Certificate state does not allow seal

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

422

'locale' is invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

certificateId \*

string

(path)

Certificate id to lookup

Code

Description

204

Domain control was successful

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Certificate id not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

409

Domain control was not successful  
Certificate state does not allow domain control

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

Once the certificate order has been created, this method can be used to check the status of the certificate. This method can also be used to retrieve details of the certificates associated to an entitlement.

Name

Description

entitlementId \*

string

(query)

Entitlement id to lookup

latest

boolean

(query)

Fetch only the most recent certificate

*Default value* : true

Code

Description

200

Certificate details retrieved

```
[
  {
    "certificateId": "string",
    "commonName": "string",
    "contact": {
      "email": "string",
      "jobTitle": "string",
      "nameFirst": "string",
      "nameLast": "string",
      "nameMiddle": "string",
      "phone": "string",
      "suffix": "string"
    },
    "createdAt": "string",
    "deniedReason": "string",
    "organization": {
      "address": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "AC",
        "postalCode": "string",
        "state": "string"
      },
      "assumedName": "string",
      "jurisdictionOfIncorporation": {
        "city": "string",
        "country": "string",
        "county": "string",
        "state": "string"
      },
      "name": "string",
      "phone": "string",
      "registrationAgent": "string",
      "registrationNumber": "string"
    },
    "period": 0,
    "productType": "DV_SSL",
    "progress": 0,
    "revokedAt": "string",
    "rootType": "GODADDY_SHA_1",
    "serialNumber": "string",
    "serialNumberHex": "string",
    "slotSize": "FIVE",
    "status": "PENDING_ISSUANCE",
    "subjectAlternativeNames": [
      {
        "status": "PENDING",
        "subjectAlternativeName": "string"
      }
    ],
    "validEnd": "string",
    "validStart": "string"
  }
]
```

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

422

Entitlement id not provided

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

entitlementId \*

string

(query)

Entitlement id to download

Code

Description

200

Certificate retrieved

```
{
  "pems": {
    "certificate": "string",
    "cross": "string",
    "intermediate": "string",
    "root": "string"
  },
  "serialNumber": "string"
}
```

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Entitlement id not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

409

Certificate state does not allow download

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

422

Entitlement id not provided

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

### [v2](#/v2)

This method can be used to retrieve a list of certificates for a specified customer.

-   **shopperId** is **not the same** as **customerId**. **shopperId** is a number of max length 10 digits (*ex:* 1234567890) whereas **customerId** is a UUIDv4 (*ex:* 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

Name

Description

customerId \*

string

(path)

An identifier for a customer

offset

integer($integer-positive)

(query)

Number of results to skip for pagination

limit

integer($integer-positive)

(query)

Maximum number of items to return

Code

Description

200

Customer certificate information retrieved.

```
{
  "certificates": [
    {
      "certificateId": "string",
      "commonName": "string",
      "period": 0,
      "type": "DV_SSL",
      "status": "ISSUED",
      "createdAt": "string",
      "completedAt": "string",
      "validEndAt": "string",
      "validStartAt": "string",
      "revokedAt": "string",
      "renewalAvailable": true,
      "serialNumber": "string",
      "slotSize": "FIVE",
      "subjectAlternativeNames": [
        "string"
      ]
    }
  ],
  "pagination": {
    "first": "string",
    "previous": "string",
    "next": "string",
    "last": "string",
    "total": 0
  }
}
```

401

Authentication info not sent or is invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

422

Application-specific request error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "retryAfterSec": 0,
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

Once the certificate order has been created, this method can be used to check the status of the certificate. This method can also be used to retrieve details of the certificate.

-   **shopperId** is **not the same** as **customerId**. **shopperId** is a number of max length 10 digits (*ex:* 1234567890) whereas **customerId** is a UUIDv4 (*ex:* 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

Name

Description

customerId \*

string

(path)

An identifier for a customer

certificateId \*

string

(path)

Certificate id to lookup

Code

Description

200

Certificate details retrieved

```
{
  "certificateId": "string",
  "commonName": "string",
  "period": 0,
  "type": "DV_SSL",
  "status": "PENDING_ISSUANCE",
  "createdAt": "string",
  "completedAt": "string",
  "validEndAt": "string",
  "validStartAt": "string",
  "revokedAt": "string",
  "renewalAvailable": true,
  "serialNumber": "string",
  "serialNumberHex": "string",
  "slotSize": "FIVE",
  "subjectAlternativeNames": [
    "string"
  ],
  "contact": {
    "email": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "phone": "string",
    "suffix": "string"
  },
  "organization": {
    "address": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "AC",
      "postalCode": "string",
      "state": "string"
    },
    "assumedName": "string",
    "jurisdictionOfIncorporation": {
      "city": "string",
      "country": "string",
      "county": "string",
      "state": "string"
    },
    "name": "string",
    "phone": "string",
    "registrationAgent": "string",
    "registrationNumber": "string"
  },
  "csr": "string",
  "rootType": "GODADDY_SHA_1",
  "deniedReason": "string",
  "progress": 0
}
```

401

Authentication info not sent or is invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Resource not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

422

Application-specific request error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "retryAfterSec": 0,
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

This method can be used to retrieve the domain verification status for a certificate request.

-   **shopperId** is **not the same** as **customerId**. **shopperId** is a number of max length 10 digits (*ex:* 1234567890) whereas **customerId** is a UUIDv4 (*ex:* 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

"

Name

Description

customerId \*

string

(path)

An identifier for a customer

certificateId \*

string

(path)

Certificate id to lookup

Code

Description

200

Domain verification status list for specified certificateId.

```
[
  {
    "domain": "string",
    "domainEntityId": 0,
    "dceToken": "string",
    "status": "COMPLETED",
    "createdAt": "string",
    "modifiedAt": "string",
    "type": "DOMAIN_CONTROL_EMAIL",
    "usage": "COMMON_NAME"
  }
]
```

401

Authentication info not sent or is invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Resource not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

422

Application-specific request error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "retryAfterSec": 0,
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

Retrieve detailed information for supplied domain, including domain verification details and Certificate Authority Authorization (CAA) verification details.

-   **shopperId** is **not the same** as **customerId**. **shopperId** is a number of max length 10 digits (*ex:* 1234567890) whereas **customerId** is a UUIDv4 (*ex:* 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

Name

Description

customerId \*

string

(path)

An identifier for a customer

certificateId \*

string

(path)

Certificate id to lookup

domain \*

string($domain)

(path)

A valid domain name in the certificate request

Code

Description

200

Retrieve detailed information for supplied domain, including domain verification details and Certificate Authority Authorization (CAA) verification details.

```
{
  "domain": "string",
  "domainEntityId": 0,
  "dceToken": "string",
  "status": "COMPLETED",
  "createdAt": "string",
  "modifiedAt": "string",
  "type": "DOMAIN_CONTROL_EMAIL",
  "usage": "COMMON_NAME",
  "certificateAuthorityAuthorization": {
    "status": "PENDING",
    "queryPaths": [
      "string"
    ],
    "recommendations": [
      "ADD_CA_TO_CAA"
    ],
    "completedAt": "string"
  }
}
```

401

Authentication info not sent or is invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Resource not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

422

Application-specific request error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "retryAfterSec": 0,
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

Use this endpoint to retrieve a key identifier and Hash-based Message Authentication Code (HMAC) key for Automated Certificate Management Environment (ACME) External Account Binding (EAB). These credentials can be used with an ACME client that supports EAB (ex. CertBot) to automate the issuance request and deployment of DV SSL certificates

Name

Description

customerId \*

string

(path)

An identifier for a customer

Code

Description

200

Acme key identifier and HMAC key for the external account binding. Directory URI is also provided for making ACME requests.

```
{
  "directoryUrl": "string",
  "keyId": "string",
  "hmacKey": "string"
}
```

401

Authentication info not sent or is invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

404

Resource not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

422

Application-specific request error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "retryAfterSec": 0,
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

500

Internal server error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string"
    }
  ],
  "message": "string"
}
```

---

*Generated on: 2025-11-09T04:56:02.602Z*
*Source: https://developer.godaddy.com/doc/endpoint/certificates*
