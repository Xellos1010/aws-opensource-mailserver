# Documentation: Domains API

**URL:** https://developer.godaddy.com/doc/endpoint/domains

**Documentation Name:** Domains API

**Endpoints Found:** 64

**Endpoints Expanded:** 64

**Endpoints Extracted:** 64

---

## API Endpoints

### GET /v1/domains

**Name:** /v1/domains

**Description:** GET/v1/domainsRetrieve a list of Domains for the specified Shopper

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Shopper-Id | string | Shopper ID whose domains are to be retrieved | No | header |
| statuses | array[string] | Only include results with status value in the specified set | No | query |
| statusGroups | array[string] | Only include results with status value in any of the specified groups | No | query |
| limit | integer | Maximum number of domains to return | No | query |
| marker | string | Marker Domain to use as the offset in results | No | query |
| includes | array[string] | Optional details to be included in the response | No | query |
| modifiedDate | string($iso-datetime) | Only include results that have been modified since the specified date | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 422 | Limit must have a value no greater than 1000 |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v1/domains/agreements

**Name:** /v1/domains/agreements

**Description:** GET/v1/domains/agreementsRetrieve the legal agreement(s) required to purchase the specified TLD and add-ons

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Market-Id | string($bcp-47) | Unique identifier of the Market used to retrieve/translate Legal Agreements | No | header |
| tlds | array[string] | list of TLDs whose legal agreements are to be retrieved | Yes | query |
| privacy | boolean | Whether or not privacy has been requested | Yes | query |
| forTransfer | boolean | Whether or not domain tranfer has been requested | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v1/domains/available

**Name:** /v1/domains/available

**Description:** GET/v1/domains/availableDetermine whether or not the specified domain is available for purchase

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| domain | string | Domain name whose availability is to be checked | Yes | query |
| checkType | string | Optimize for time ('FAST') or accuracy ('FULL') | No | query |
| forTransfer | boolean | Whether or not to include domains available for transfer. If set to True, checkType is ignored | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 422 | Cannot convert domain label errorDomain is missing IDN scriptDomain segment ends with dashDomain starts with dashbr>Domain uses unsupported IDN scriptFQDN fails generic validity regexInvalid character(s) errorInvalid tld errorNon-IDN domain name must not have dashes at the third and fourth positionReserved name errordomain must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v1/domains/available

**Name:** /v1/domains/available

**Description:** POST/v1/domains/availableDetermine whether or not the specified domains are available for purchase

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| domains | array[string] | Domain names for which to check availability | Yes | body |
| checkType | string | Optimize for time ('FAST') or accuracy ('FULL') | No | query |

#### Request Body

**Content Type:** application/json

**Example:**

```json
[
  "string"
]
```

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 203 | Request was partially successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 422 | Cannot convert domain label errorDomain is missing IDN scriptDomain segment ends with dashDomain starts with dashDomain uses unsupported IDN scriptFQDN fails generic validity regexInvalid character(s) errorInvalid tld errorNon-IDN domain name must not have dashes at the third and fourth positionReserved name errorReserved name errordomain must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v1/domains/contacts/validate

**Name:** /v1/domains/contacts/validate

**Description:** All contacts specified in request will be validated against all domains specifed in "domains". As an alternative, you can also pass in tlds, with the exception of uk, which requires full domain names

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Private-Label-Id | integer | PrivateLabelId to operate as, if different from JWT | No | header |
| marketId | string($bcp-47) | MarketId in which the request is being made, and for which responses should be localized | No | query |
| body | string | An instance document expected for domains contacts validation | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "contactAdmin": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactBilling": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactPresence": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactRegistrant": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactTech": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "domains": [
    "string"
  ],
  "entityType": "ABORIGINAL"
}
```

#### Responses

| Code | Description |
|------|-------------|
| 200 | No response was specified |
| 204 | Request was successful |
| 400 | Request was malformed |
| 422 | Request body doesn't fulfill schema, see details in fields |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v1/domains/purchase

**Name:** /v1/domains/purchase

**Description:** POST/v1/domains/purchasePurchase and register the specified Domain

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Shopper-Id | string | The Shopper for whom the domain should be purchased | No | header |
| body | string | An instance document expected to match the JSON schema returned by ./schema/{tld} | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "consent": {
    "agreedAt": "string",
    "agreedBy": "string",
    "agreementKeys": [
      "string"
    ]
  },
  "contactAdmin": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactBilling": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactRegistrant": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactTech": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "domain": "string",
  "nameServers": [
    "string"
  ],
  "period": 1,
  "privacy": false,
  "renewAuto": true
}
```

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | domain must be specifiedBased on restrictions declared in JSON schema returned by ./schema/{tld}Cannot convert domain label errorDomain is missing IDN scriptDomain segment ends with dashDomain starts with dashDomain uses unsupported IDN scriptFQDN fails generic validity regexInvalid character(s) errorInvalid tld errorNon-IDN domain name must not have dashes at the third and fourth positionReserved name errorbody must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v1/domains/purchase/schema/{tld}

**Name:** /v1/domains/purchase/schema/{tld}

**Description:** GET/v1/domains/purchase/schema/{tld}Retrieve the schema to be submitted when registering a Domain for the specified TLD

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| tld | string | The Top-Level Domain whose schema should be retrieved | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | tld must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v1/domains/purchase/validate

**Name:** /v1/domains/purchase/validate

**Description:** POST/v1/domains/purchase/validateValidate the request body using the Domain Purchase Schema for the specified TLD

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| body | string | An instance document expected to match the JSON schema returned by ./schema/{tld} | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "consent": {
    "agreedAt": "string",
    "agreedBy": "string",
    "agreementKeys": [
      "string"
    ]
  },
  "contactAdmin": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactBilling": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactRegistrant": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactTech": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "domain": "string",
  "nameServers": [
    "string"
  ],
  "period": 1,
  "privacy": false,
  "renewAuto": true
}
```

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | Based on restrictions declared in JSON schema returned by ./schema/{tld} |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v1/domains/suggest

**Name:** /v1/domains/suggest

**Description:** GET/v1/domains/suggestSuggest alternate Domain names based on a seed Domain, a set of keywords, or the shopper's purchase history

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Shopper-Id | string | Shopper ID for which the suggestions are being generated | No | header |
| query | string | Domain name or set of keywords for which alternative domain names will be suggested | No | query |
| country | string($iso-country-code) | Two-letter ISO country code to be used as a hint for target region
NOTE: These are sample values, there are many
more | No | query |
| city | string($city-name) | Name of city to be used as a hint for target region | No | query |
| sources | array[string] | Sources to be queried | No | query |
| tlds | array[string] | Top-level domains to be included in suggestions
NOTE: These are sample values, there are many
more | No | query |
| lengthMax | integer | Maximum length of second-level domain | No | query |
| lengthMin | integer | Minimum length of second-level domain | No | query |
| limit | integer | Maximum number of suggestions to return | No | query |
| waitMs | integer($integer-positive) | Maximum amount of time, in milliseconds, to wait for responses
If elapses, return the results compiled up to that point | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | query must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |
| 504 | Gateway timeout |

---

### GET /v1/domains/tlds

**Name:** /v1/domains/tlds

**Description:** No parameters

**Tag:** v1

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### DELETE /v1/domains/{domain}

**Name:** /v1/domains/{domain}

**Description:** DELETE/v1/domains/{domain}Cancel a purchased domain

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| domain | string | Domain to cancel | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 422 | Unknown domain errorAt least two apex (aka @) nameServers must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v1/domains/{domain}

**Name:** /v1/domains/{domain}

**Description:** GET/v1/domains/{domain}Retrieve details for the specified Domain

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Shopper-Id | string | Shopper ID expected to own the specified domain | No | header |
| domain | string | Domain name whose details are to be retrieved | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 203 | Request was partially successful, see verifications.status for further detail |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | domain must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### PATCH /v1/domains/{domain}

**Name:** /v1/domains/{domain}

**Description:** PATCH/v1/domains/{domain}Update details for the specified Domain

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| domain | string | Domain whose details are to be updated | Yes | path |
| X-Shopper-Id | string | Shopper for whom Domain is to be updated. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via http://www.godaddy.com | No | header |
| body | string | Changes to apply to existing Domain | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "locked": true,
  "nameServers": [
    "string"
  ],
  "renewAuto": true,
  "subaccountId": "string",
  "exposeRegistrantOrganization": true,
  "exposeWhois": true,
  "consent": {
    "agreedAt": "string",
    "agreedBy": "string",
    "agreementKeys": [
      "EXPOSE_REGISTRANT_ORGANIZATION"
    ]
  }
}
```

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Specified Subaccount not owned by authenticated Shopper |
| 404 | Resource not found |
| 409 | The given domain is not eligible to have its nameservers changed |
| 422 | At least two apex (aka @) nameServers must be specifiedFailed to update nameservers |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### PATCH /v1/domains/{domain}/contacts

**Name:** /v1/domains/{domain}/contacts

**Description:** PATCH/v1/domains/{domain}/contactsUpdate domain

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Shopper-Id | string | Shopper for whom domain contacts are to be updated. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via http://www.godaddy.com | No | header |
| domain | string | Domain whose Contacts are to be updated. | Yes | path |
| contacts | string | Changes to apply to existing Contacts | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "contactAdmin": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactBilling": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactRegistrant": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactTech": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  }
}
```

#### Responses

| Code | Description |
|------|-------------|
| 200 | No response was specified |
| 204 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Domain not foundIdentity document not found |
| 422 | domain is not a valid Domain name |
| 429 | Too many requests received within interval |
| 500 | Internal server error |
| 504 | Gateway timeout |

---

### DELETE /v1/domains/{domain}/privacy

**Name:** /v1/domains/{domain}/privacy

**Description:** DELETE/v1/domains/{domain}/privacySubmit a privacy cancellation request for the given domain

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Shopper-Id | string | Shopper ID of the owner of the domain | No | header |
| domain | string | Domain whose privacy is to be cancelled | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 422 | Customer has purchased Domain Ownership Protection and the domain has expiredThe domain status does not allow performing the operationUnknown domain error |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v1/domains/{domain}/privacy/purchase

**Name:** /v1/domains/{domain}/privacy/purchase

**Description:** POST/v1/domains/{domain}/privacy/purchasePurchase privacy for a specified domain

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Shopper-Id | string | Shopper ID of the owner of the domain | No | header |
| domain | string | Domain for which to purchase privacy | Yes | path |
| body | string | Options for purchasing privacy | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "consent": {
    "agreedAt": "string",
    "agreedBy": "string",
    "agreementKeys": [
      "string"
    ]
  }
}
```

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 409 | The domain status does not allow performing the operation |
| 422 | End-user must read and consent to all of the following legal agreementsdomain must match sld.tld |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### PATCH /v1/domains/{domain}/records

**Name:** /v1/domains/{domain}/records

**Description:** PATCH/v1/domains/{domain}/recordsAdd the specified DNS Records to the specified Domain

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Shopper-Id | string | Shopper ID which owns the domain. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via http://www.godaddy.com | No | header |
| domain | string | Domain whose DNS Records are to be augmented | Yes | path |
| records | array | DNS Records to add to whatever currently exists | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
[
  {
    "data": "string",
    "name": "string",
    "port": 65535,
    "priority": 0,
    "protocol": "string",
    "service": "string",
    "ttl": 0,
    "type": "A",
    "weight": 0
  }
]
```

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | domain is not a valid Domain name |
| 429 | Too many requests received within interval |
| 500 | Internal server error |
| 504 | Gateway timeout |

---

### PUT /v1/domains/{domain}/records

**Name:** /v1/domains/{domain}/records

**Description:** PUT/v1/domains/{domain}/recordsReplace all DNS Records for the specified Domain

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Shopper-Id | string | Shopper ID which owns the domain. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via http://www.godaddy.com | No | header |
| domain | string | Domain whose DNS Records are to be replaced | Yes | path |
| records | array | DNS Records to replace whatever currently exists | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
[
  {
    "data": "string",
    "name": "string",
    "port": 65535,
    "priority": 0,
    "protocol": "string",
    "service": "string",
    "ttl": 0,
    "type": "A",
    "weight": 0
  }
]
```

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | domain is not a valid Domain namerecord does not fulfill the schema |
| 429 | Too many requests received within interval |
| 500 | Internal server error |
| 504 | Gateway timeout |

---

### GET /v1/domains/{domain}/records/{type}/{name}

**Name:** /v1/domains/{domain}/records/{type}/{name}

**Description:** GET/v1/domains/{domain}/records/{type}/{name}Retrieve DNS Records for the specified Domain, optionally with the specified Type and/or Name

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Shopper-Id | string | Shopper ID which owns the domain. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via http://www.godaddy.com | No | header |
| domain | string | Domain whose DNS Records are to be retrieved | Yes | path |
| type | string | DNS Record Type for which DNS Records are to be retrieved | Yes | path |
| name | string | DNS Record Name for which DNS Records are to be retrieved | Yes | path |
| offset | integer | Number of results to skip for pagination | No | query |
| limit | integer | Maximum number of items to return | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | record does not fulfill the schemadomain is not a valid Domain name |
| 429 | Too many requests received within interval |
| 500 | Internal server error |
| 504 | Gateway timeout |

---

### PUT /v1/domains/{domain}/records/{type}/{name}

**Name:** /v1/domains/{domain}/records/{type}/{name}

**Description:** PUT/v1/domains/{domain}/records/{type}/{name}Replace all DNS Records for the specified Domain with the specified Type and Name

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Shopper-Id | string | Shopper ID which owns the domain. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via http://www.godaddy.com | No | header |
| domain | string | Domain whose DNS Records are to be replaced | Yes | path |
| type | string | DNS Record Type for which DNS Records are to be replaced | Yes | path |
| name | string | DNS Record Name for which DNS Records are to be replaced | Yes | path |
| records | array | DNS Records to replace whatever currently exists | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
[
  {
    "data": "string",
    "port": 65535,
    "priority": 0,
    "protocol": "string",
    "service": "string",
    "ttl": 0,
    "weight": 0
  }
]
```

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | record does not fulfill the schema |
| 429 | Too many requests received within interval |
| 500 | Internal server error |
| 504 | Gateway timeout |

---

### DELETE /v1/domains/{domain}/records/{type}/{name}

**Name:** /v1/domains/{domain}/records/{type}/{name}

**Description:** DELETE/v1/domains/{domain}/records/{type}/{name}Delete all DNS Records for the specified Domain with the specified Type and Name

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Shopper-Id | string | Shopper ID which owns the domain. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via http://www.godaddy.com | No | header |
| domain | string | Domain whose DNS Records are to be deleted | Yes | path |
| type | string | DNS Record Type for which DNS Records are to be deleted | Yes | path |
| name | string | DNS Record Name for which DNS Records are to be deleted | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 204 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Domain not found |
| 409 | The given domain is not eligible to have its records changed |
| 422 | domain is not a valid Domain name |
| 429 | Too many requests received within interval |
| 500 | Internal server error |
| 504 | Gateway timeout |

---

### PUT /v1/domains/{domain}/records/{type}

**Name:** /v1/domains/{domain}/records/{type}

**Description:** PUT/v1/domains/{domain}/records/{type}Replace all DNS Records for the specified Domain with the specified Type

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Shopper-Id | string | Shopper ID which owns the domain. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via http://www.godaddy.com | No | header |
| domain | string | Domain whose DNS Records are to be replaced | Yes | path |
| type | string | DNS Record Type for which DNS Records are to be replaced | Yes | path |
| records | array | DNS Records to replace whatever currently exists | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
[
  {
    "data": "string",
    "name": "string",
    "port": 65535,
    "priority": 0,
    "protocol": "string",
    "service": "string",
    "ttl": 0,
    "weight": 0
  }
]
```

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | record does not fulfill the schema |
| 429 | Too many requests received within interval |
| 500 | Internal server error |
| 504 | Gateway timeout |

---

### POST /v1/domains/{domain}/renew

**Name:** /v1/domains/{domain}/renew

**Description:** POST/v1/domains/{domain}/renewRenew the specified Domain

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Shopper-Id | string | Shopper for whom Domain is to be renewed. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via http://www.godaddy.com | No | header |
| domain | string | Domain to renew | Yes | path |
| body | string | Options for renewing existing Domain | No | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "period": 10
}
```

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 409 | The domain status does not allow performing the operation |
| 422 | End-user must read and consent to all of the following legal agreementsdomain must match sld.tld |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v1/domains/{domain}/transfer

**Name:** /v1/domains/{domain}/transfer

**Description:** POST/v1/domains/{domain}/transferPurchase and start or restart transfer process

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Shopper-Id | string | The Shopper to whom the domain should be transfered | No | header |
| domain | string | Domain to transfer in | Yes | path |
| body | string | Details for domain transfer purchase | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "authCode": "string",
  "consent": {
    "agreedAt": "string",
    "agreedBy": "string",
    "agreementKeys": [
      "string"
    ]
  },
  "period": 1,
  "privacy": false,
  "renewAuto": true,
  "contactAdmin": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactBilling": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactRegistrant": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactTech": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  }
}
```

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 409 | domain (domain) isn't available for transfer |
| 422 | Based on restrictions declared in JSON schema returned by ./schema/{tld}Cannot convert domain label errorDomain is missing IDN scriptDomain segment ends with dashDomain starts with dashDomain uses unsupported IDN scriptEnd-user must read and consent to all of the following legal agreementsFQDN fails generic validity regexInvalid character(s) errorInvalid period rangeInvalid tld errorNon-IDN domain name must not have dashes at the third and fourth positionReserved name errorauthCode cannot be emptydomain must match sld.tlddomain must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v1/domains/{domain}/verifyRegistrantEmail

**Name:** /v1/domains/{domain}/verifyRegistrantEmail

**Description:** POST/v1/domains/{domain}/verifyRegistrantEmailRe-send Contact E-mail Verification for specified Domain

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Shopper-Id | string | Shopper for whom domain contact e-mail should be verified. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via http://www.godaddy.com | No | header |
| domain | string | Domain whose Contact E-mail should be verified. | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | domain is not a valid Domain name |
| 429 | Too many requests received within interval |
| 500 | Internal server error |
| 504 | Gateway timeout |

---

### GET /v2/customers/{customerId}/domains/{domain}

**Name:** /v2/customers/{customerId}/domains/{domain}

**Description:** GET/v2/customers/{customerId}/domains/{domain}Retrieve details for the specified Domain

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain name whose details are to be retrieved | Yes | path |
| includes | array[string] | Optional details to be included in the response | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 203 | Request was partially successful, but actions, contacts, and/or verifications may not be included. |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The contact does not exist |
| 422 | domain must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### DELETE /v2/customers/{customerId}/domains/{domain}/changeOfRegistrant

**Name:** /v2/customers/{customerId}/domains/{domain}/changeOfRegistrant

**Description:** DELETE/v2/customers/{customerId}/domains/{domain}/changeOfRegistrantCancels a pending change of registrant request for a given domain

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain whose change of registrant is to be cancelled | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/CHANGE_OF_REGISTRANT_DELETE to poll status |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The contact does not exist |
| 409 | There is already a similar action processing |
| 422 | domain must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |
| 502 | Dependent service unavailable |

---

### GET /v2/customers/{customerId}/domains/{domain}/changeOfRegistrant

**Name:** /v2/customers/{customerId}/domains/{domain}/changeOfRegistrant

**Description:** GET/v2/customers/{customerId}/domains/{domain}/changeOfRegistrantRetrieve change of registrant information

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain whose change of registrant information is to be retrieved | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The contact does not exist |
| 409 | There is already a similar action processing |
| 422 | domain must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |
| 502 | Dependent service unavailable |

---

### PATCH /v2/customers/{customerId}/domains/{domain}/dnssecRecords

**Name:** /v2/customers/{customerId}/domains/{domain}/dnssecRecords

**Description:** PATCH/v2/customers/{customerId}/domains/{domain}/dnssecRecordsAdd the specifed DNSSEC records to the domain

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain to add the DNSSEC record for | Yes | path |
| body | array | DNSSEC records to add | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
[
  {
    "algorithm": "RSAMD5",
    "keyTag": 65536,
    "digestType": "SHA1",
    "digest": "string",
    "flags": "ZSK",
    "publicKey": "string",
    "maxSignatureLife": 0
  }
]
```

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/DNSSEC_CREATE to poll status |
| 400 | Authentication info not sent or invalid |
| 401 | Request was malformed |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 409 | There is already a similar action processing |
| 422 | Request body doesn't fulfill schema, see details in fields |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### DELETE /v2/customers/{customerId}/domains/{domain}/dnssecRecords

**Name:** /v2/customers/{customerId}/domains/{domain}/dnssecRecords

**Description:** DELETE/v2/customers/{customerId}/domains/{domain}/dnssecRecordsRemove the specifed DNSSEC record from the domain

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain to delete the DNSSEC record for | Yes | path |
| body | array | DNSSEC records to remove | Yes | body |

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/DNSSEC_DELETE to poll status |
| 400 | Authentication info not sent or invalid |
| 401 | Request was malformed |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 409 | There is already a similar action processing |
| 422 | Request body doesn't fulfill schema, see details in fields |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### PUT /v2/customers/{customerId}/domains/{domain}/nameServers

**Name:** /v2/customers/{customerId}/domains/{domain}/nameServers

**Description:** PUT/v2/customers/{customerId}/domains/{domain}/nameServersReplaces the existing name servers on the domain.

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain whose name servers are to be replaced | Yes | path |
| body | string | Name server records to replace on the domain | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "nameServers": [
    "string"
  ]
}
```

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/DOMAIN_UPDATE_NAME_SERVERS to poll status |
| 400 | Authentication info not sent or invalid |
| 401 | Request was malformed |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 409 | There is already a similar action processing |
| 422 | Request body doesn't fulfill schema, see details in fields |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v2/customers/{customerId}/domains/{domain}/privacy/forwarding

**Name:** /v2/customers/{customerId}/domains/{domain}/privacy/forwarding

**Description:** GET/v2/customers/{customerId}/domains/{domain}/privacy/forwardingRetrieve privacy email forwarding settings showing where emails are delivered

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain name whose details are to be retrieved | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 422 | domain must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### PATCH /v2/customers/{customerId}/domains/{domain}/privacy/forwarding

**Name:** /v2/customers/{customerId}/domains/{domain}/privacy/forwarding

**Description:** PATCH/v2/customers/{customerId}/domains/{domain}/privacy/forwardingUpdate privacy email forwarding settings to determine how emails are delivered

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain name whose details are to be retrieved | Yes | path |
| body | string | Update privacy email forwarding settings | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "privateEmailType": "DEFAULT",
  "forwardingEmail": "string",
  "emailPreference": "EMAIL_FILTER"
}
```

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/PRIVACY_FORWARDING_UPDATE to poll status |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 409 | There is already a similar action processing |
| 422 | Request body doesn't fulfill schema, see details in fields |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v2/customers/{customerId}/domains/{domain}/redeem

**Name:** /v2/customers/{customerId}/domains/{domain}/redeem

**Description:** POST/v2/customers/{customerId}/domains/{domain}/redeemPurchase a restore for the given domain to bring it out of redemption

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain to request redeem for | Yes | path |
| body | string | Options for redeeming existing Domain | No | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "consent": {
    "price": 0,
    "fee": 0,
    "currency": "USD",
    "agreedBy": "string",
    "agreedAt": "string"
  }
}
```

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/REDEEM to poll status |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 409 | There is already a similar action processing |
| 422 | Domain invalid |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v2/customers/{customerId}/domains/{domain}/renew

**Name:** /v2/customers/{customerId}/domains/{domain}/renew

**Description:** POST/v2/customers/{customerId}/domains/{domain}/renewRenew the specified Domain

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain to be renewed | Yes | path |
| body | string | Options for renewing existing Domain | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "expires": "string",
  "consent": {
    "price": 0,
    "currency": "USD",
    "registryPremiumPricing": true,
    "agreedBy": "string",
    "agreedAt": "string"
  },
  "period": 10
}
```

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/RENEW to poll status |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 409 | There is already a similar action processing |
| 422 | Request body doesn't fulfill schema, see details in fields |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v2/customers/{customerId}/domains/{domain}/transfer

**Name:** /v2/customers/{customerId}/domains/{domain}/transfer

**Description:** POST/v2/customers/{customerId}/domains/{domain}/transferPurchase and start or restart transfer process

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain to transfer in | Yes | path |
| body | string | Details for domain transfer purchase | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "authCode": "string",
  "period": 1,
  "renewAuto": true,
  "privacy": false,
  "identityDocumentId": "string",
  "consent": {
    "agreementKeys": [
      "string"
    ],
    "price": 0,
    "currency": "USD",
    "registryPremiumPricing": true,
    "agreedBy": "string",
    "agreedAt": "string",
    "claimToken": "string"
  },
  "contacts": {
    "admin": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "adminId": "string",
    "billing": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "billingId": "string",
    "registrant": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "registrantId": "string",
    "tech": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "techId": "string"
  },
  "metadata": {}
}
```

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/TRANSFER to poll status |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 409 | There is already a similar action processing |
| 422 | Based on restrictions declared in JSON schema returned by ./schema/{tld} |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v2/customers/{customerId}/domains/{domain}/transfer

**Name:** /v2/customers/{customerId}/domains/{domain}/transfer

**Description:** GET/v2/customers/{customerId}/domains/{domain}/transferQuery the current transfer status

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain Name | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v2/customers/{customerId}/domains/{domain}/transfer/validate

**Name:** /v2/customers/{customerId}/domains/{domain}/transfer/validate

**Description:** POST/v2/customers/{customerId}/domains/{domain}/transfer/validateValidate the request body using the Domain Transfer Schema for the specified TLD

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain to transfer in | Yes | path |
| body | string | Details for domain transfer purchase | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "authCode": "string",
  "period": 1,
  "renewAuto": true,
  "privacy": false,
  "identityDocumentId": "string",
  "consent": {
    "agreementKeys": [
      "string"
    ],
    "price": 0,
    "currency": "USD",
    "registryPremiumPricing": true,
    "agreedBy": "string",
    "agreedAt": "string",
    "claimToken": "string"
  },
  "contacts": {
    "admin": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "adminId": "string",
    "billing": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "billingId": "string",
    "registrant": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "registrantId": "string",
    "tech": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "techId": "string"
  },
  "metadata": {}
}
```

#### Responses

| Code | Description |
|------|-------------|
| 204 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 409 | There is already a similar action processing |
| 422 | Based on restrictions declared in JSON schema returned by ./schema/{tld} |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v2/customers/{customerId}/domains/{domain}/transferInAccept

**Name:** /v2/customers/{customerId}/domains/{domain}/transferInAccept

**Description:** POST/v2/customers/{customerId}/domains/{domain}/transferInAcceptAccepts the transfer in

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain to accept the transfer in for | Yes | path |
| body | object | An Authorization code for transferring the Domain | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "authCode": "string"
}
```

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/TRANSFER_IN_ACCEPT to poll status |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 409 | The domain status does not allow performing the operation |
| 422 | Request body doesn't fulfill schema, see details in fields |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v2/customers/{customerId}/domains/{domain}/transferInCancel

**Name:** /v2/customers/{customerId}/domains/{domain}/transferInCancel

**Description:** POST/v2/customers/{customerId}/domains/{domain}/transferInCancelCancels the transfer in

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain to cancel the transfer in for | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/TRANSFER_IN_CANCEL to poll status |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 409 | There is already a similar action processing |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v2/customers/{customerId}/domains/{domain}/transferInRestart

**Name:** /v2/customers/{customerId}/domains/{domain}/transferInRestart

**Description:** POST/v2/customers/{customerId}/domains/{domain}/transferInRestartRestarts transfer in request from the beginning

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain to restart the transfer in | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/TRANSFER_IN_RESTART to poll status |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 409 | The domain status does not allow performing the operation |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v2/customers/{customerId}/domains/{domain}/transferInRetry

**Name:** /v2/customers/{customerId}/domains/{domain}/transferInRetry

**Description:** POST/v2/customers/{customerId}/domains/{domain}/transferInRetryRetries the current transfer in request with supplied Authorization code

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain to retry the transfer in | Yes | path |
| body | object | An Authorization code for transferring the Domain | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "authCode": "string"
}
```

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/TRANSFER_IN_RETRY to poll status |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 409 | The domain status does not allow performing the operation |
| 422 | Request body doesn't fulfill schema, see details in fields |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v2/customers/{customerId}/domains/{domain}/transferOut

**Name:** /v2/customers/{customerId}/domains/{domain}/transferOut

**Description:** POST/v2/customers/{customerId}/domains/{domain}/transferOutInitiate transfer out to another registrar for a .uk domain.

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain to initiate the transfer out for | Yes | path |
| registrar | string | Registrar tag to push transfer to | Yes | query |

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/TRANSFER_OUT_REQUESTED to poll status |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 409 | There is already a similar action processing |
| 422 | Domain invalid. TLD must be .uk |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v2/customers/{customerId}/domains/{domain}/transferOutAccept

**Name:** /v2/customers/{customerId}/domains/{domain}/transferOutAccept

**Description:** POST/v2/customers/{customerId}/domains/{domain}/transferOutAcceptAccept transfer out

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain to accept the transfer out for | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/TRANSFER_OUT_ACCEPT to poll status |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 409 | There is already a similar action processing |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v2/customers/{customerId}/domains/{domain}/transferOutReject

**Name:** /v2/customers/{customerId}/domains/{domain}/transferOutReject

**Description:** POST/v2/customers/{customerId}/domains/{domain}/transferOutRejectReject transfer out

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain to reject the transfer out for | Yes | path |
| reason | string | Transfer out reject reason | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/TRANSFER_OUT_REJECT to poll status |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 409 | There is already a similar action processing |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### DELETE /v2/customers/{customerId}/domains/forwards/{fqdn}

**Name:** /v2/customers/{customerId}/domains/forwards/{fqdn}

**Description:** Notes:shopperId is not the same as customerId.  shopperId is a number of max length 10 digits (ex: 1234567890) whereas customerId is a UUIDv4 (ex: 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| fqdn | string | The fully qualified domain name whose forwarding details are to be deleted. | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 204 | Request was successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 409 | The domain status does not allow performing the operation |
| 422 | A valid fqdn must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v2/customers/{customerId}/domains/forwards/{fqdn}

**Name:** /v2/customers/{customerId}/domains/forwards/{fqdn}

**Description:** Notes:shopperId is not the same as customerId.  shopperId is a number of max length 10 digits (ex: 1234567890) whereas customerId is a UUIDv4 (ex: 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| fqdn | string | The fully qualified domain name whose forwarding details are to be retrieved. | Yes | path |
| includeSubs | boolean | Optionally include all sub domains if the fqdn specified is a domain and not a sub domain. | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | A valid fqdn must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### PUT /v2/customers/{customerId}/domains/forwards/{fqdn}

**Name:** /v2/customers/{customerId}/domains/forwards/{fqdn}

**Description:** Notes:shopperId is not the same as customerId.  shopperId is a number of max length 10 digits (ex: 1234567890) whereas customerId is a UUIDv4 (ex: 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| fqdn | string | The fully qualified domain name whose forwarding details are to be modified. | Yes | path |
| body | string | Domain forwarding rule to create or replace on the fqdn | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "type": "REDIRECT_PERMANENT",
  "url": "string",
  "mask": {
    "title": "string",
    "description": "string",
    "keywords": "string"
  }
}
```

#### Responses

| Code | Description |
|------|-------------|
| 204 | Request was successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 409 | The domain status does not allow performing the operation |
| 422 | Request body doesn't fulfill schema, see details in fields |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v2/customers/{customerId}/domains/forwards/{fqdn}

**Name:** /v2/customers/{customerId}/domains/forwards/{fqdn}

**Description:** Notes:shopperId is not the same as customerId.  shopperId is a number of max length 10 digits (ex: 1234567890) whereas customerId is a UUIDv4 (ex: 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your own customer id. | Yes | path |
| fqdn | string | The fully qualified domain name whose forwarding details are to be modified. | Yes | path |
| body | string | Domain forwarding rule to create for the specified fqdn | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "type": "REDIRECT_PERMANENT",
  "url": "string",
  "mask": {
    "title": "string",
    "description": "string",
    "keywords": "string"
  }
}
```

#### Responses

| Code | Description |
|------|-------------|
| 204 | Request was successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 409 | Provided fqdn already has forwarding setup |
| 422 | Request body doesn't fulfill schema, see details in fields |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v2/customers/{customerId}/domains/register

**Name:** /v2/customers/{customerId}/domains/register

**Description:** POST/v2/customers/{customerId}/domains/registerPurchase and register the specified Domain

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| body | string | An instance document expected to match the JSON schema returned by ./schema/{tld} | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "domain": "string",
  "consent": {
    "agreementKeys": [
      "string"
    ],
    "price": 0,
    "currency": "USD",
    "registryPremiumPricing": true,
    "agreedBy": "string",
    "agreedAt": "string",
    "claimToken": "string"
  },
  "period": 1,
  "nameServers": [
    "string"
  ],
  "renewAuto": true,
  "privacy": false,
  "contacts": {
    "admin": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "adminId": "string",
    "billing": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "billingId": "string",
    "registrant": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "registrantId": "string",
    "tech": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "techId": "string"
  },
  "metadata": {}
}
```

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/REGISTER to poll status |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 409 | There is already a similar action processing |
| 422 | Based on restrictions declared in JSON schema returned by ./schema/{tld} |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v2/customers/{customerId}/domains/register/schema/{tld}

**Name:** /v2/customers/{customerId}/domains/register/schema/{tld}

**Description:** GET/v2/customers/{customerId}/domains/register/schema/{tld}Retrieve the schema to be submitted when registering a Domain for the specified TLD

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| tld | string | The Top-Level Domain whose schema should be retrieved | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The tld does not exist |
| 422 | tld must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v2/customers/{customerId}/domains/register/validate

**Name:** /v2/customers/{customerId}/domains/register/validate

**Description:** POST/v2/customers/{customerId}/domains/register/validateValidate the request body using the Domain Registration Schema for the specified TLD

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| body | string | An instance document expected to match the JSON schema returned by ./schema/{tld} | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "domain": "string",
  "consent": {
    "agreementKeys": [
      "string"
    ],
    "price": 0,
    "currency": "USD",
    "registryPremiumPricing": true,
    "agreedBy": "string",
    "agreedAt": "string",
    "claimToken": "string"
  },
  "period": 1,
  "nameServers": [
    "string"
  ],
  "renewAuto": true,
  "privacy": false,
  "contacts": {
    "admin": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "adminId": "string",
    "billing": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "billingId": "string",
    "registrant": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "registrantId": "string",
    "tech": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "techId": "string"
  },
  "metadata": {}
}
```

#### Responses

| Code | Description |
|------|-------------|
| 204 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The customer does not exist |
| 422 | Based on restrictions declared in JSON schema returned by ./schema/{tld} |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v2/domains/maintenances

**Name:** /v2/domains/maintenances

**Description:** GET/v2/domains/maintenancesRetrieve a list of upcoming system Maintenances

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| status | string | Only include results with the selected status value.  Returns all results if omitted | No | query |
| modifiedAtAfter | string($iso-datetime) | Only include results with modifiedAt after the supplied date | No | query |
| startsAtAfter | string($iso-datetime) | Only include results with startsAt after the supplied date | No | query |
| limit | integer | Maximum number of results to return | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 422 | Filter parameters don't match schema and/or restrictions |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v2/domains/maintenances/{maintenanceId}

**Name:** /v2/domains/maintenances/{maintenanceId}

**Description:** GET/v2/domains/maintenances/{maintenanceId}Retrieve the details for an upcoming system Maintenances

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| maintenanceId | string | The identifier for the system maintenance | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The maintenance does not exist |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v2/domains/usage/{yyyymm}

**Name:** /v2/domains/usage/{yyyymm}

**Description:** GET/v2/domains/usage/{yyyymm}Retrieve api usage request counts for a specific year/month.  The data is retained for a period of three months.

**Tag:** Domains

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| yyyymm | string | The year/month timeframe for the request counts (in the format yyyy-mm) | Yes | path |
| includes | array[string] | Determines if the detail records (grouped by request path) are included in the response | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v2/customers/{customerId}/domains/{domain}/actions

**Name:** /v2/customers/{customerId}/domains/{domain}/actions

**Description:** GET/v2/customers/{customerId}/domains/{domain}/actionsRetrieves a list of the most recent actions for the specified domain

**Tag:** Actions

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain whose actions are to be retrieved | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### DELETE /v2/customers/{customerId}/domains/{domain}/actions/{type}

**Name:** /v2/customers/{customerId}/domains/{domain}/actions/{type}

**Description:** DELETE/v2/customers/{customerId}/domains/{domain}/actions/{type}Cancel the most recent user action for the specified domain

**Tag:** Actions

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain whose action is to be cancelled | Yes | path |
| type | string | The type of action to cancel | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 204 | Request was successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 409 | The action status does not allow performing the operation |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v2/customers/{customerId}/domains/{domain}/actions/{type}

**Name:** /v2/customers/{customerId}/domains/{domain}/actions/{type}

**Description:** GET/v2/customers/{customerId}/domains/{domain}/actions/{type}Retrieves the most recent action for the specified domain

**Tag:** Actions

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain whose action is to be retrieved | Yes | path |
| type | string | The type of action to retrieve | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 409 | The domain status does not allow performing the operation |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v2/customers/{customerId}/domains/notifications

**Name:** /v2/customers/{customerId}/domains/notifications

**Description:** GET/v2/customers/{customerId}/domains/notificationsRetrieve the next domain notification

**Tag:** Notifications

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The customer does not exist |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v2/customers/{customerId}/domains/notifications/optIn

**Name:** /v2/customers/{customerId}/domains/notifications/optIn

**Description:** GET/v2/customers/{customerId}/domains/notifications/optInRetrieve a list of notification types that are opted in

**Tag:** Notifications

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The customer does not exist |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### PUT /v2/customers/{customerId}/domains/notifications/optIn

**Name:** /v2/customers/{customerId}/domains/notifications/optIn

**Description:** PUT/v2/customers/{customerId}/domains/notifications/optInOpt in to recieve notifications for the submitted notification types

**Tag:** Notifications

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| types | array[string] | The notification types that should be opted in | Yes | query |

#### Responses

| Code | Description |
|------|-------------|
| 204 | Command successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The customer does not exist |
| 422 | type must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v2/customers/{customerId}/domains/notifications/schemas/{type}

**Name:** /v2/customers/{customerId}/domains/notifications/schemas/{type}

**Description:** GET/v2/customers/{customerId}/domains/notifications/schemas/{type}Retrieve the schema for the notification data for the specified notification type

**Tag:** Notifications

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| type | string | The notification type whose schema should be retrieved | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The schema type does not exist |
| 422 | type must be specified |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v2/customers/{customerId}/domains/notifications/{notificationId}/acknowledge

**Name:** /v2/customers/{customerId}/domains/notifications/{notificationId}/acknowledge

**Description:** POST/v2/customers/{customerId}/domains/notifications/{notificationId}/acknowledgeAcknowledge a domain notification

**Tag:** Notifications

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| notificationId | string | The notification ID to acknowledge | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 204 | Message acknowledged |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### PATCH /v2/customers/{customerId}/domains/{domain}/contacts

**Name:** /v2/customers/{customerId}/domains/{domain}/contacts

**Description:** PATCH/v2/customers/{customerId}/domains/{domain}/contactsUpdate domain contacts

**Tag:** Contacts

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Request-Id | string | A client provided identifier for tracking this request. | No | header |
| customerId | string | The Customer identifier Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id. | Yes | path |
| domain | string | Domain whose Contacts are to be updated. | Yes | path |
| body | string | Changes to apply to existing Contacts | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "identityDocumentId": "string",
  "contacts": {
    "admin": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "adminId": "string",
    "billing": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "billingId": "string",
    "registrant": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "registrantId": "string",
    "tech": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "techId": "string"
  }
}
```

#### Responses

| Code | Description |
|------|-------------|
| 202 | Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/DOMAIN_UPDATE_CONTACTS to poll status |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | The domain does not exist |
| 409 | There is already a similar action processing |
| 422 | Request body doesn't fulfill schema, see details in fields |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

## Full Documentation

# Untitled

### [v1](#/v1)

Name

Description

X-Shopper-Id

string

(header)

Shopper ID whose domains are to be retrieved

statuses

array\[string\]

(query)

Only include results with `status` value in the specified set

*Available values* : ACTIVE, AWAITING\_CLAIM\_ACK, AWAITING\_DOCUMENT\_AFTER\_TRANSFER, AWAITING\_DOCUMENT\_AFTER\_UPDATE\_ACCOUNT, AWAITING\_DOCUMENT\_UPLOAD, AWAITING\_FAILED\_TRANSFER\_WHOIS\_PRIVACY, AWAITING\_PAYMENT, AWAITING\_RENEWAL\_TRANSFER\_IN\_COMPLETE, AWAITING\_TRANSFER\_IN\_ACK, AWAITING\_TRANSFER\_IN\_AUTH, AWAITING\_TRANSFER\_IN\_AUTO, AWAITING\_TRANSFER\_IN\_WHOIS, AWAITING\_TRANSFER\_IN\_WHOIS\_FIX, AWAITING\_VERIFICATION\_ICANN, AWAITING\_VERIFICATION\_ICANN\_MANUAL, CANCELLED, CANCELLED\_HELD, CANCELLED\_REDEEMABLE, CANCELLED\_TRANSFER, CONFISCATED, DISABLED\_SPECIAL, EXCLUDED\_INVALID\_CLAIM\_FIREHOSE, EXPIRED\_REASSIGNED, FAILED\_BACKORDER\_CAPTURE, FAILED\_DROP\_IMMEDIATE\_THEN\_ADD, FAILED\_PRE\_REGISTRATION, FAILED\_REDEMPTION, FAILED\_REDEMPTION\_REPORT, FAILED\_REGISTRATION, FAILED\_REGISTRATION\_FIREHOSE, FAILED\_RESTORATION\_REDEMPTION\_MOCK, FAILED\_SETUP, FAILED\_TRANSFER\_IN, FAILED\_TRANSFER\_IN\_BAD\_STATUS, FAILED\_TRANSFER\_IN\_REGISTRY, HELD\_COURT\_ORDERED, HELD\_DISPUTED, HELD\_EXPIRATION\_PROTECTION, HELD\_EXPIRED\_REDEMPTION\_MOCK, HELD\_REGISTRAR\_ADD, HELD\_REGISTRAR\_REMOVE, HELD\_SHOPPER, HELD\_TEMPORARY, LOCKED\_ABUSE, LOCKED\_COPYRIGHT, LOCKED\_REGISTRY, LOCKED\_SUPER, PARKED\_AND\_HELD, PARKED\_EXPIRED, PARKED\_VERIFICATION\_ICANN, PENDING\_ABORT\_CANCEL\_SETUP, PENDING\_AGREEMENT\_PRE\_REGISTRATION, PENDING\_APPLY\_RENEWAL\_CREDITS, PENDING\_BACKORDER\_CAPTURE, PENDING\_BLOCKED\_REGISTRY, PENDING\_CANCEL\_REGISTRANT\_PROFILE, PENDING\_COMPLETE\_REDEMPTION\_WITHOUT\_RECEIPT, PENDING\_COMPLETE\_REGISTRANT\_PROFILE, PENDING\_COO, PENDING\_COO\_COMPLETE, PENDING\_DNS, PENDING\_DNS\_ACTIVE, PENDING\_DNS\_INACTIVE, PENDING\_DOCUMENT\_VALIDATION, PENDING\_DOCUMENT\_VERIFICATION, PENDING\_DROP\_IMMEDIATE, PENDING\_DROP\_IMMEDIATE\_THEN\_ADD, PENDING\_EPP\_CREATE, PENDING\_EPP\_DELETE, PENDING\_EPP\_UPDATE, PENDING\_ESCALATION\_REGISTRY, PENDING\_EXPIRATION, PENDING\_EXPIRATION\_RESPONSE, PENDING\_EXPIRATION\_SYNC, PENDING\_EXPIRED\_REASSIGNMENT, PENDING\_EXPIRE\_AUTO\_ADD, PENDING\_EXTEND\_REGISTRANT\_PROFILE, PENDING\_FAILED\_COO, PENDING\_FAILED\_EPP\_CREATE, PENDING\_FAILED\_HELD, PENDING\_FAILED\_PURCHASE\_PREMIUM, PENDING\_FAILED\_RECONCILE\_FIREHOSE, PENDING\_FAILED\_REDEMPTION\_WITHOUT\_RECEIPT, PENDING\_FAILED\_RELEASE\_PREMIUM, PENDING\_FAILED\_RENEW\_EXPIRATION\_PROTECTION, PENDING\_FAILED\_RESERVE\_PREMIUM, PENDING\_FAILED\_SUBMIT\_FIREHOSE, PENDING\_FAILED\_TRANSFER\_ACK\_PREMIUM, PENDING\_FAILED\_TRANSFER\_IN\_ACK\_PREMIUM, PENDING\_FAILED\_TRANSFER\_IN\_PREMIUM, PENDING\_FAILED\_TRANSFER\_PREMIUM, PENDING\_FAILED\_TRANSFER\_SUBMIT\_PREMIUM, PENDING\_FAILED\_UNLOCK\_PREMIUM, PENDING\_FAILED\_UPDATE\_API, PENDING\_FRAUD\_VERIFICATION, PENDING\_FRAUD\_VERIFIED, PENDING\_GET\_CONTACTS, PENDING\_GET\_HOSTS, PENDING\_GET\_NAME\_SERVERS, PENDING\_GET\_STATUS, PENDING\_HOLD\_ESCROW, PENDING\_HOLD\_REDEMPTION, PENDING\_LOCK\_CLIENT\_REMOVE, PENDING\_LOCK\_DATA\_QUALITY, PENDING\_LOCK\_THEN\_HOLD\_REDEMPTION, PENDING\_PARKING\_DETERMINATION, PENDING\_PARK\_INVALID\_WHOIS, PENDING\_PARK\_INVALID\_WHOIS\_REMOVAL, PENDING\_PURCHASE\_PREMIUM, PENDING\_RECONCILE, PENDING\_RECONCILE\_FIREHOSE, PENDING\_REDEMPTION, PENDING\_REDEMPTION\_REPORT, PENDING\_REDEMPTION\_REPORT\_COMPLETE, PENDING\_REDEMPTION\_REPORT\_SUBMITTED, PENDING\_REDEMPTION\_WITHOUT\_RECEIPT, PENDING\_REDEMPTION\_WITHOUT\_RECEIPT\_MOCK, PENDING\_RELEASE\_PREMIUM, PENDING\_REMOVAL, PENDING\_REMOVAL\_HELD, PENDING\_REMOVAL\_PARKED, PENDING\_REMOVAL\_UNPARK, PENDING\_RENEWAL, PENDING\_RENEW\_EXPIRATION\_PROTECTION, PENDING\_RENEW\_INFINITE, PENDING\_RENEW\_LOCKED, PENDING\_RENEW\_WITHOUT\_RECEIPT, PENDING\_REPORT\_REDEMPTION\_WITHOUT\_RECEIPT, PENDING\_RESERVE\_PREMIUM, PENDING\_RESET\_VERIFICATION\_ICANN, PENDING\_RESPONSE\_FIREHOSE, PENDING\_RESTORATION, PENDING\_RESTORATION\_INACTIVE, PENDING\_RESTORATION\_REDEMPTION\_MOCK, PENDING\_RETRY\_EPP\_CREATE, PENDING\_RETRY\_HELD, PENDING\_SEND\_AUTH\_CODE, PENDING\_SETUP, PENDING\_SETUP\_ABANDON, PENDING\_SETUP\_AGREEMENT\_LANDRUSH, PENDING\_SETUP\_AGREEMENT\_SUNRISE2\_A, PENDING\_SETUP\_AGREEMENT\_SUNRISE2\_B, PENDING\_SETUP\_AGREEMENT\_SUNRISE2\_C, PENDING\_SETUP\_AUTH, PENDING\_SETUP\_DNS, PENDING\_SETUP\_FAILED, PENDING\_SETUP\_REVIEW, PENDING\_SETUP\_SUNRISE, PENDING\_SETUP\_SUNRISE\_PRE, PENDING\_SETUP\_SUNRISE\_RESPONSE, PENDING\_SUBMIT\_FAILURE, PENDING\_SUBMIT\_FIREHOSE, PENDING\_SUBMIT\_HOLD\_FIREHOSE, PENDING\_SUBMIT\_HOLD\_LANDRUSH, PENDING\_SUBMIT\_HOLD\_SUNRISE, PENDING\_SUBMIT\_LANDRUSH, PENDING\_SUBMIT\_RESPONSE\_FIREHOSE, PENDING\_SUBMIT\_RESPONSE\_LANDRUSH, PENDING\_SUBMIT\_RESPONSE\_SUNRISE, PENDING\_SUBMIT\_SUCCESS\_FIREHOSE, PENDING\_SUBMIT\_SUCCESS\_LANDRUSH, PENDING\_SUBMIT\_SUCCESS\_SUNRISE, PENDING\_SUBMIT\_SUNRISE, PENDING\_SUBMIT\_WAITING\_LANDRUSH, PENDING\_SUCCESS\_PRE\_REGISTRATION, PENDING\_SUSPENDED\_DATA\_QUALITY, PENDING\_TRANSFER\_ACK\_PREMIUM, PENDING\_TRANSFER\_IN, PENDING\_TRANSFER\_IN\_ACK, PENDING\_TRANSFER\_IN\_ACK\_PREMIUM, PENDING\_TRANSFER\_IN\_BAD\_REGISTRANT, PENDING\_TRANSFER\_IN\_CANCEL, PENDING\_TRANSFER\_IN\_CANCEL\_REGISTRY, PENDING\_TRANSFER\_IN\_COMPLETE\_ACK, PENDING\_TRANSFER\_IN\_DELETE, PENDING\_TRANSFER\_IN\_LOCK, PENDING\_TRANSFER\_IN\_NACK, PENDING\_TRANSFER\_IN\_NOTIFICATION, PENDING\_TRANSFER\_IN\_PREMIUM, PENDING\_TRANSFER\_IN\_RELEASE, PENDING\_TRANSFER\_IN\_RESPONSE, PENDING\_TRANSFER\_IN\_UNDERAGE, PENDING\_TRANSFER\_OUT, PENDING\_TRANSFER\_OUT\_ACK, PENDING\_TRANSFER\_OUT\_NACK, PENDING\_TRANSFER\_OUT\_PREMIUM, PENDING\_TRANSFER\_OUT\_UNDERAGE, PENDING\_TRANSFER\_OUT\_VALIDATION, PENDING\_TRANSFER\_PREMIUM, PENDING\_TRANSFER\_PREMUIM, PENDING\_TRANSFER\_SUBMIT\_PREMIUM, PENDING\_UNLOCK\_DATA\_QUALITY, PENDING\_UNLOCK\_PREMIUM, PENDING\_UPDATE, PENDING\_UPDATED\_REGISTRANT\_DATA\_QUALITY, PENDING\_UPDATE\_ACCOUNT, PENDING\_UPDATE\_API, PENDING\_UPDATE\_API\_RESPONSE, PENDING\_UPDATE\_AUTH, PENDING\_UPDATE\_CONTACTS, PENDING\_UPDATE\_CONTACTS\_PRIVACY, PENDING\_UPDATE\_DNS, PENDING\_UPDATE\_DNS\_SECURITY, PENDING\_UPDATE\_ELIGIBILITY, PENDING\_UPDATE\_EPP\_CONTACTS, PENDING\_UPDATE\_MEMBERSHIP, PENDING\_UPDATE\_OWNERSHIP, PENDING\_UPDATE\_OWNERSHIP\_AUTH\_AUCTION, PENDING\_UPDATE\_OWNERSHIP\_HELD, PENDING\_UPDATE\_REGISTRANT, PENDING\_UPDATE\_REPO, PENDING\_VALIDATION\_DATA\_QUALITY, PENDING\_VERIFICATION\_FRAUD, PENDING\_VERIFICATION\_STATUS, PENDING\_VERIFY\_REGISTRANT\_DATA\_QUALITY, RESERVED, RESERVED\_PREMIUM, REVERTED, SUSPENDED\_VERIFICATION\_ICANN, TRANSFERRED\_OUT, UNLOCKED\_ABUSE, UNLOCKED\_SUPER, UNPARKED\_AND\_UNHELD, UPDATED\_OWNERSHIP, UPDATED\_OWNERSHIP\_HELD

statusGroups

array\[string\]

(query)

Only include results with `status` value in any of the specified groups

*Available values* : INACTIVE, PRE\_REGISTRATION, REDEMPTION, RENEWABLE, VERIFICATION\_ICANN, VISIBLE

limit

integer

(query)

Maximum number of domains to return

marker

string

(query)

Marker Domain to use as the offset in results

includes

array\[string\]

(query)

Optional details to be included in the response

*Available values* : authCode, contacts, nameServers

modifiedDate

string($iso-datetime)

(query)

Only include results that have been modified since the specified date

Code

Description

200

Request was successful

```
[
  {
    "authCode": "string",
    "contactAdmin": {
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "email": "user@example.com",
      "fax": "string",
      "jobTitle": "string",
      "nameFirst": "string",
      "nameLast": "string",
      "nameMiddle": "string",
      "organization": "string",
      "phone": "string"
    },
    "contactBilling": {
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "email": "user@example.com",
      "fax": "string",
      "jobTitle": "string",
      "nameFirst": "string",
      "nameLast": "string",
      "nameMiddle": "string",
      "organization": "string",
      "phone": "string"
    },
    "contactRegistrant": {
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "email": "user@example.com",
      "fax": "string",
      "jobTitle": "string",
      "nameFirst": "string",
      "nameLast": "string",
      "nameMiddle": "string",
      "organization": "string",
      "phone": "string"
    },
    "contactTech": {
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "email": "user@example.com",
      "fax": "string",
      "jobTitle": "string",
      "nameFirst": "string",
      "nameLast": "string",
      "nameMiddle": "string",
      "organization": "string",
      "phone": "string"
    },
    "createdAt": "2025-11-09T04:57:26.548Z",
    "deletedAt": "2025-11-09T04:57:26.548Z",
    "transferAwayEligibleAt": "2025-11-09T04:57:26.548Z",
    "domain": "string",
    "domainId": 0,
    "expirationProtected": true,
    "expires": "2025-11-09T04:57:26.548Z",
    "exposeWhois": true,
    "holdRegistrar": true,
    "locked": true,
    "nameServers": [
      "string"
    ],
    "privacy": true,
    "registrarCreatedAt": "string",
    "renewAuto": true,
    "renewDeadline": "2025-11-09T04:57:26.548Z",
    "renewable": true,
    "status": "string",
    "transferProtected": true
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Limit must have a value no greater than 1000

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Market-Id

string($bcp-47)

(header)

Unique identifier of the Market used to retrieve/translate Legal Agreements

*Default value* : en-US

tlds \*

array\[string\]

(query)

list of TLDs whose legal agreements are to be retrieved

privacy \*

boolean

(query)

Whether or not privacy has been requested

forTransfer

boolean

(query)

Whether or not domain tranfer has been requested

Code

Description

200

Request was successful

```
[
  {
    "agreementKey": "string",
    "content": "string",
    "title": "string",
    "url": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

domain \*

string

(query)

Domain name whose availability is to be checked

checkType

string

(query)

Optimize for time ('FAST') or accuracy ('FULL')

*Available values* : FAST, FULL, fast, full

*Default value* : FAST

forTransfer

boolean

(query)

Whether or not to include domains available for transfer. If set to True, checkType is ignored

*Default value* : false

Code

Description

200

Request was successful

```
{
  "available": true,
  "currency": "USD",
  "definitive": true,
  "domain": "string",
  "period": 0,
  "price": 0
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Cannot convert domain label error  
Domain is missing IDN script  
Domain segment ends with dash  
Domain starts with dashbr>Domain uses unsupported IDN script  
FQDN fails generic validity regex  
Invalid character(s) error  
Invalid tld error  
Non-IDN domain name must not have dashes at the third and fourth position  
Reserved name error  
domain must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

domains \*

array\[string\]

(body)

Domain names for which to check availability

```
[
  "string"
]
```

Parameter content type

checkType

string

(query)

Optimize for time ('FAST') or accuracy ('FULL')

*Available values* : FAST, FULL, fast, full

*Default value* : FAST

Code

Description

200

Request was successful

```
{
  "domains": [
    {
      "available": true,
      "currency": "USD",
      "definitive": true,
      "domain": "string",
      "period": 0,
      "price": 0
    }
  ]
}
```

203

Request was partially successful

```
{
  "domains": [
    {
      "available": true,
      "currency": "USD",
      "definitive": true,
      "domain": "string",
      "period": 0,
      "price": 0
    }
  ],
  "errors": [
    {
      "code": "string",
      "domain": "string",
      "message": "string",
      "path": "string",
      "status": 0
    }
  ]
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Cannot convert domain label error  
Domain is missing IDN script  
Domain segment ends with dash  
Domain starts with dash  
Domain uses unsupported IDN script  
FQDN fails generic validity regex  
Invalid character(s) error  
Invalid tld error  
Non-IDN domain name must not have dashes at the third and fourth position  
Reserved name error  
Reserved name error  
domain must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

All contacts specified in request will be validated against all domains specifed in "domains". As an alternative, you can also pass in tlds, with the exception of `uk`, which requires full domain names

Name

Description

X-Private-Label-Id

integer

(header)

PrivateLabelId to operate as, if different from JWT

*Default value* : 1

marketId

string($bcp-47)

(query)

MarketId in which the request is being made, and for which responses should be localized

*Default value* : en-US

body \*

(body)

An instance document expected for domains contacts validation

```
{
  "contactAdmin": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactBilling": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactPresence": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactRegistrant": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactTech": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "domains": [
    "string"
  ],
  "entityType": "ABORIGINAL"
}
```

Parameter content type

Code

Description

200

No response was specified

204

Request was successful

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Request body doesn't fulfill schema, see details in `fields`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "domains": [
        "string"
      ],
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "stack": [
    "string"
  ]
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Shopper-Id

string

(header)

The Shopper for whom the domain should be purchased

body \*

(body)

An instance document expected to match the JSON schema returned by `./schema/{tld}`

```
{
  "consent": {
    "agreedAt": "string",
    "agreedBy": "string",
    "agreementKeys": [
      "string"
    ]
  },
  "contactAdmin": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactBilling": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactRegistrant": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactTech": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "domain": "string",
  "nameServers": [
    "string"
  ],
  "period": 1,
  "privacy": false,
  "renewAuto": true
}
```

Parameter content type

Code

Description

200

Request was successful

```
{
  "currency": "USD",
  "itemCount": 0,
  "orderId": 0,
  "total": 0
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

domain must be specified  
Based on restrictions declared in JSON schema returned by `./schema/{tld}`  
Cannot convert domain label error  
Domain is missing IDN script  
Domain segment ends with dash  
Domain starts with dash  
Domain uses unsupported IDN script  
FQDN fails generic validity regex  
Invalid character(s) error  
Invalid tld error  
Non-IDN domain name must not have dashes at the third and fourth position  
Reserved name error  
`body` must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

tld \*

string

(path)

The Top-Level Domain whose schema should be retrieved

Code

Description

200

Request was successful

```
{
  "id": "string",
  "models": {},
  "properties": {},
  "required": [
    "string"
  ]
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`tld` must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

body \*

(body)

An instance document expected to match the JSON schema returned by `./schema/{tld}`

```
{
  "consent": {
    "agreedAt": "string",
    "agreedBy": "string",
    "agreementKeys": [
      "string"
    ]
  },
  "contactAdmin": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactBilling": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactRegistrant": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactTech": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "domain": "string",
  "nameServers": [
    "string"
  ],
  "period": 1,
  "privacy": false,
  "renewAuto": true
}
```

Parameter content type

Code

Description

200

Request was successful

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Based on restrictions declared in JSON schema returned by `./schema/{tld}`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Shopper-Id

string

(header)

Shopper ID for which the suggestions are being generated

query

string

(query)

Domain name or set of keywords for which alternative domain names will be suggested

country

string($iso-country-code)

(query)

Two-letter ISO country code to be used as a hint for target region

NOTE: These are sample values, there are many  
[more](http://www.iso.org/iso/country_codes.htm)

*Available values* : AC, AD, AE, AF, AG, AI, AL, AM, AO, AQ, AR, AS, AT, AU, AW, AX, AZ, BA, BB, BD, BE, BF, BG, BH, BI, BJ, BM, BN, BO, BQ, BR, BS, BT, BV, BW, BY, BZ, CA, CC, CD, CF, CG, CH, CI, CK, CL, CM, CN, CO, CR, CV, CW, CX, CY, CZ, DE, DJ, DK, DM, DO, DZ, EC, EE, EG, EH, ER, ES, ET, FI, FJ, FK, FM, FO, FR, GA, GB, GD, GE, GF, GG, GH, GI, GL, GM, GN, GP, GQ, GR, GS, GT, GU, GW, GY, HK, HM, HN, HR, HT, HU, ID, IE, IL, IM, IN, IO, IQ, IS, IT, JE, JM, JO, JP, KE, KG, KH, KI, KM, KN, KR, KV, KW, KY, KZ, LA, LB, LC, LI, LK, LR, LS, LT, LU, LV, LY, MA, MC, MD, ME, MG, MH, MK, ML, MM, MN, MO, MP, MQ, MR, MS, MT, MU, MV, MW, MX, MY, MZ, NA, NC, NE, NF, NG, NI, NL, NO, NP, NR, NU, NZ, OM, PA, PE, PF, PG, PH, PK, PL, PM, PN, PR, PS, PT, PW, PY, QA, RE, RO, RS, RU, RW, SA, SB, SC, SE, SG, SH, SI, SJ, SK, SL, SM, SN, SO, SR, ST, SV, SX, SZ, TC, TD, TF, TG, TH, TJ, TK, TL, TM, TN, TO, TP, TR, TT, TV, TW, TZ, UA, UG, UM, US, UY, UZ, VA, VC, VE, VG, VI, VN, VU, WF, WS, YE, YT, ZA, ZM, ZW

city

string($city-name)

(query)

Name of city to be used as a hint for target region

sources

array\[string\]

(query)

Sources to be queried

-   **CC\_TLD** - Varies the TLD using Country Codes
-   **EXTENSION** - Varies the TLD
-   **KEYWORD\_SPIN** - Identifies keywords and then rotates each one
-   **PREMIUM** - Includes variations with premium prices

*Available values* : CC\_TLD, EXTENSION, KEYWORD\_SPIN, PREMIUM, cctld, extension, keywordspin, premium

tlds

array\[string\]

(query)

Top-level domains to be included in suggestions

NOTE: These are sample values, there are many  
[more](http://www.godaddy.com/tlds/gtld.aspx#domain_search_form)

lengthMax

integer

(query)

Maximum length of second-level domain

lengthMin

integer

(query)

Minimum length of second-level domain

limit

integer

(query)

Maximum number of suggestions to return

waitMs

integer($integer-positive)

(query)

Maximum amount of time, in milliseconds, to wait for responses  
If elapses, return the results compiled up to that point

*Default value* : 1000

Code

Description

200

Request was successful

```
[
  {
    "domain": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`query` must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

504

Gateway timeout

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Code

Description

200

Request was successful

```
[
  {
    "name": "string",
    "type": "GENERIC"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

domain \*

string

(path)

Domain to cancel

Code

Description

200

Request was successful

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Unknown domain error  
At least two apex (aka @) `nameServers` must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Shopper-Id

string

(header)

Shopper ID expected to own the specified domain

domain \*

string

(path)

Domain name whose details are to be retrieved

Code

Description

200

Request was successful

```
{
  "authCode": "string",
  "contactAdmin": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactBilling": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactRegistrant": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactTech": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "createdAt": "2025-11-09T04:57:26.632Z",
  "deletedAt": "2025-11-09T04:57:26.632Z",
  "transferAwayEligibleAt": "2025-11-09T04:57:26.632Z",
  "domain": "string",
  "domainId": 0,
  "expirationProtected": true,
  "expires": "2025-11-09T04:57:26.632Z",
  "exposeRegistrantOrganization": true,
  "exposeWhois": true,
  "holdRegistrar": true,
  "locked": true,
  "nameServers": [
    "string"
  ],
  "privacy": true,
  "registrarCreatedAt": "string",
  "renewAuto": true,
  "renewDeadline": "2025-11-09T04:57:26.632Z",
  "status": "string",
  "subaccountId": "string",
  "transferProtected": true,
  "verifications": {
    "domainName": {
      "status": "APPROVED"
    },
    "realName": {
      "status": "APPROVED"
    }
  }
}
```

203

Request was partially successful, see verifications.status for further detail

```
{
  "authCode": "string",
  "contactAdmin": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactBilling": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactRegistrant": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactTech": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "createdAt": "2025-11-09T04:57:26.635Z",
  "deletedAt": "2025-11-09T04:57:26.635Z",
  "transferAwayEligibleAt": "2025-11-09T04:57:26.635Z",
  "domain": "string",
  "domainId": 0,
  "expirationProtected": true,
  "expires": "2025-11-09T04:57:26.635Z",
  "exposeRegistrantOrganization": true,
  "exposeWhois": true,
  "holdRegistrar": true,
  "locked": true,
  "nameServers": [
    "string"
  ],
  "privacy": true,
  "registrarCreatedAt": "string",
  "renewAuto": true,
  "renewDeadline": "2025-11-09T04:57:26.635Z",
  "status": "string",
  "subaccountId": "string",
  "transferProtected": true,
  "verifications": {
    "domainName": {
      "status": "APPROVED"
    },
    "realName": {
      "status": "APPROVED"
    }
  }
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`domain` must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

domain \*

string

(path)

Domain whose details are to be updated

X-Shopper-Id

string

(header)

Shopper for whom Domain is to be updated. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via [http://www.godaddy.com](http://www.godaddy.com/)

body \*

(body)

Changes to apply to existing Domain

```
{
  "locked": true,
  "nameServers": [
    "string"
  ],
  "renewAuto": true,
  "subaccountId": "string",
  "exposeRegistrantOrganization": true,
  "exposeWhois": true,
  "consent": {
    "agreedAt": "string",
    "agreedBy": "string",
    "agreementKeys": [
      "EXPOSE_REGISTRANT_ORGANIZATION"
    ]
  }
}
```

Parameter content type

Code

Description

200

Request was successful

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

403

Specified Subaccount not owned by authenticated Shopper

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

The given domain is not eligible to have its nameservers changed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

At least two apex (aka @) `nameServers` must be specified  
Failed to update nameservers

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Shopper-Id

string

(header)

Shopper ID of the owner of the domain

domain \*

string

(path)

Domain whose privacy is to be cancelled

Code

Description

200

Request was successful

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Customer has purchased Domain Ownership Protection and the domain has expired  
The domain status does not allow performing the operation  
Unknown domain error

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Shopper-Id

string

(header)

Shopper ID of the owner of the domain

domain \*

string

(path)

Domain for which to purchase privacy

body \*

(body)

Options for purchasing privacy

```
{
  "consent": {
    "agreedAt": "string",
    "agreedBy": "string",
    "agreementKeys": [
      "string"
    ]
  }
}
```

Parameter content type

Code

Description

200

Request was successful

```
{
  "currency": "USD",
  "itemCount": 0,
  "orderId": 0,
  "total": 0
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

The domain status does not allow performing the operation

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

End-user must read and consent to all of the following legal agreements  
`domain` must match `sld.tld`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Shopper-Id

string

(header)

Shopper ID which owns the domain. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via [http://www.godaddy.com](http://www.godaddy.com/)

domain \*

string

(path)

Domain whose DNS Records are to be augmented

records \*

array

(body)

DNS Records to add to whatever currently exists

```
[
  {
    "data": "string",
    "name": "string",
    "port": 65535,
    "priority": 0,
    "protocol": "string",
    "service": "string",
    "ttl": 0,
    "type": "A",
    "weight": 0
  }
]
```

Parameter content type

Code

Description

200

Request was successful

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`domain` is not a valid Domain name

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

504

Gateway timeout

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Shopper-Id

string

(header)

Shopper ID which owns the domain. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via [http://www.godaddy.com](http://www.godaddy.com/)

domain \*

string

(path)

Domain whose DNS Records are to be replaced

records \*

array

(body)

DNS Records to replace whatever currently exists

```
[
  {
    "data": "string",
    "name": "string",
    "port": 65535,
    "priority": 0,
    "protocol": "string",
    "service": "string",
    "ttl": 0,
    "type": "A",
    "weight": 0
  }
]
```

Parameter content type

Code

Description

200

Request was successful

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`domain` is not a valid Domain name  
`record` does not fulfill the schema

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

504

Gateway timeout

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Shopper-Id

string

(header)

Shopper ID which owns the domain. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via [http://www.godaddy.com](http://www.godaddy.com/)

domain \*

string

(path)

Domain whose DNS Records are to be retrieved

type \*

string

(path)

DNS Record Type for which DNS Records are to be retrieved

*Available values* : A, AAAA, CNAME, MX, NS, SOA, SRV, TXT

name \*

string

(path)

DNS Record Name for which DNS Records are to be retrieved

offset

integer

(query)

Number of results to skip for pagination

limit

integer

(query)

Maximum number of items to return

Code

Description

200

Request was successful

```
[
  {
    "data": "string",
    "name": "string",
    "port": 65535,
    "priority": 0,
    "protocol": "string",
    "service": "string",
    "ttl": 0,
    "type": "A",
    "weight": 0
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`record` does not fulfill the schema  
`domain` is not a valid Domain name

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

504

Gateway timeout

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Shopper-Id

string

(header)

Shopper ID which owns the domain. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via [http://www.godaddy.com](http://www.godaddy.com/)

domain \*

string

(path)

Domain whose DNS Records are to be replaced

type \*

string

(path)

DNS Record Type for which DNS Records are to be replaced

*Available values* : A, AAAA, CNAME, MX, NS, SOA, SRV, TXT

name \*

string

(path)

DNS Record Name for which DNS Records are to be replaced

records \*

array

(body)

DNS Records to replace whatever currently exists

```
[
  {
    "data": "string",
    "port": 65535,
    "priority": 0,
    "protocol": "string",
    "service": "string",
    "ttl": 0,
    "weight": 0
  }
]
```

Parameter content type

Code

Description

200

Request was successful

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`record` does not fulfill the schema

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

504

Gateway timeout

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Shopper-Id

string

(header)

Shopper ID which owns the domain. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via [http://www.godaddy.com](http://www.godaddy.com/)

domain \*

string

(path)

Domain whose DNS Records are to be deleted

type \*

string

(path)

DNS Record Type for which DNS Records are to be deleted

*Available values* : A, AAAA, CNAME, MX, SRV, TXT

name \*

string

(path)

DNS Record Name for which DNS Records are to be deleted

Code

Description

204

Request was successful

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

Domain not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

The given domain is not eligible to have its records changed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`domain` is not a valid Domain name

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

504

Gateway timeout

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Shopper-Id

string

(header)

Shopper ID which owns the domain. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via [http://www.godaddy.com](http://www.godaddy.com/)

domain \*

string

(path)

Domain whose DNS Records are to be replaced

type \*

string

(path)

DNS Record Type for which DNS Records are to be replaced

*Available values* : A, AAAA, CNAME, MX, NS, SOA, SRV, TXT

records \*

array

(body)

DNS Records to replace whatever currently exists

```
[
  {
    "data": "string",
    "name": "string",
    "port": 65535,
    "priority": 0,
    "protocol": "string",
    "service": "string",
    "ttl": 0,
    "weight": 0
  }
]
```

Parameter content type

Code

Description

200

Request was successful

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`record` does not fulfill the schema

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

504

Gateway timeout

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Shopper-Id

string

(header)

Shopper for whom Domain is to be renewed. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via [http://www.godaddy.com](http://www.godaddy.com/)

domain \*

string

(path)

Domain to renew

body

(body)

Options for renewing existing Domain

```
{
  "period": 10
}
```

Parameter content type

Code

Description

200

Request was successful

```
{
  "currency": "USD",
  "itemCount": 0,
  "orderId": 0,
  "total": 0
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

The domain status does not allow performing the operation

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

End-user must read and consent to all of the following legal agreements  
`domain` must match `sld.tld`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Shopper-Id

string

(header)

The Shopper to whom the domain should be transfered

domain \*

string

(path)

Domain to transfer in

body \*

(body)

Details for domain transfer purchase

```
{
  "authCode": "string",
  "consent": {
    "agreedAt": "string",
    "agreedBy": "string",
    "agreementKeys": [
      "string"
    ]
  },
  "period": 1,
  "privacy": false,
  "renewAuto": true,
  "contactAdmin": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactBilling": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactRegistrant": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  },
  "contactTech": {
    "addressMailing": {
      "address1": "string",
      "address2": "string",
      "city": "string",
      "country": "US",
      "postalCode": "string",
      "state": "string"
    },
    "email": "user@example.com",
    "fax": "string",
    "jobTitle": "string",
    "nameFirst": "string",
    "nameLast": "string",
    "nameMiddle": "string",
    "organization": "string",
    "phone": "string"
  }
}
```

Parameter content type

Code

Description

200

Request was successful

```
{
  "currency": "USD",
  "itemCount": 0,
  "orderId": 0,
  "total": 0
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

`domain` (domain) isn't available for transfer

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Based on restrictions declared in JSON schema returned by `./schema/{tld}`  
Cannot convert domain label error  
Domain is missing IDN script  
Domain segment ends with dash  
Domain starts with dash  
Domain uses unsupported IDN script  
End-user must read and consent to all of the following legal agreements  
FQDN fails generic validity regex  
Invalid character(s) error  
Invalid period range  
Invalid tld error  
Non-IDN domain name must not have dashes at the third and fourth position  
Reserved name error  
`authCode` cannot be empty  
`domain` must match `sld.tld`  
domain must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Shopper-Id

string

(header)

Shopper for whom domain contact e-mail should be verified. NOTE: This is only required if you are a Reseller managing a domain purchased outside the scope of your reseller account. For instance, if you're a Reseller, but purchased a Domain via [http://www.godaddy.com](http://www.godaddy.com/)

domain \*

string

(path)

Domain whose Contact E-mail should be verified.

Code

Description

200

Request was successful

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`domain` is not a valid Domain name

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

504

Gateway timeout

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

### [Domains](#/Domains)

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain name whose details are to be retrieved

includes

array\[string\]

(query)

Optional details to be included in the response

*Available values* : actions, contacts, dnssecRecords, registryStatusCodes

Code

Description

200

Request was successful

```
{
  "domainId": "string",
  "domain": "string",
  "subaccountId": "string",
  "status": "ACTIVE",
  "expiresAt": "string",
  "expirationProtected": true,
  "holdRegistrar": true,
  "locked": true,
  "privacy": true,
  "registrarCreatedAt": "string",
  "renewAuto": true,
  "renewDeadline": "string",
  "transferProtected": true,
  "createdAt": "string",
  "deletedAt": "string",
  "modifiedAt": "string",
  "transferAwayEligibleAt": "string",
  "authCode": "string",
  "nameServers": [
    "string"
  ],
  "hostnames": [
    "string"
  ],
  "renewal": {
    "renewable": true,
    "price": 0,
    "currency": "USD"
  },
  "verifications": {
    "icann": "COMPLETED",
    "realName": "APPROVED",
    "domainName": "APPROVED"
  },
  "contacts": {
    "registrant": {
      "contactId": "string",
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "exposeRegistrantOrganization": true,
      "exposeWhois": true,
      "metadata": {},
      "tlds": [
        "string"
      ],
      "_createdAt": "string",
      "_modifiedAt": "string",
      "_deleted": true,
      "_revision": 0
    },
    "admin": {
      "contactId": "string",
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "exposeRegistrantOrganization": true,
      "exposeWhois": true,
      "metadata": {},
      "tlds": [
        "string"
      ],
      "_createdAt": "string",
      "_modifiedAt": "string",
      "_deleted": true,
      "_revision": 0
    },
    "tech": {
      "contactId": "string",
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "exposeRegistrantOrganization": true,
      "exposeWhois": true,
      "metadata": {},
      "tlds": [
        "string"
      ],
      "_createdAt": "string",
      "_modifiedAt": "string",
      "_deleted": true,
      "_revision": 0
    },
    "billing": {
      "contactId": "string",
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "exposeRegistrantOrganization": true,
      "exposeWhois": true,
      "metadata": {},
      "tlds": [
        "string"
      ],
      "_createdAt": "string",
      "_modifiedAt": "string",
      "_deleted": true,
      "_revision": 0
    }
  },
  "actions": [
    {
      "type": "AUTH_CODE_PURCHASE",
      "origination": "USER",
      "createdAt": "string",
      "startedAt": "string",
      "completedAt": "string",
      "modifiedAt": "string",
      "status": "ACCEPTED",
      "reason": {
        "code": "string",
        "message": "string",
        "fields": [
          {
            "code": "string",
            "message": "string",
            "path": "string",
            "pathRelated": "string"
          }
        ]
      },
      "requestId": "string"
    }
  ],
  "dnssecRecords": [
    {
      "algorithm": "RSAMD5",
      "keyTag": 65536,
      "digestType": "SHA1",
      "digest": "string",
      "flags": "ZSK",
      "publicKey": "string",
      "maxSignatureLife": 0
    }
  ],
  "registryStatusCodes": [
    "ADD_PERIOD"
  ]
}
```

203

Request was partially successful, but actions, contacts, and/or verifications may not be included.

```
{
  "domainId": "string",
  "domain": "string",
  "subaccountId": "string",
  "status": "ACTIVE",
  "expiresAt": "string",
  "expirationProtected": true,
  "holdRegistrar": true,
  "locked": true,
  "privacy": true,
  "registrarCreatedAt": "string",
  "renewAuto": true,
  "renewDeadline": "string",
  "transferProtected": true,
  "createdAt": "string",
  "deletedAt": "string",
  "modifiedAt": "string",
  "transferAwayEligibleAt": "string",
  "authCode": "string",
  "nameServers": [
    "string"
  ],
  "hostnames": [
    "string"
  ],
  "renewal": {
    "renewable": true,
    "price": 0,
    "currency": "USD"
  },
  "verifications": {
    "icann": "COMPLETED",
    "realName": "APPROVED",
    "domainName": "APPROVED"
  },
  "contacts": {
    "registrant": {
      "contactId": "string",
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "exposeRegistrantOrganization": true,
      "exposeWhois": true,
      "metadata": {},
      "tlds": [
        "string"
      ],
      "_createdAt": "string",
      "_modifiedAt": "string",
      "_deleted": true,
      "_revision": 0
    },
    "admin": {
      "contactId": "string",
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "exposeRegistrantOrganization": true,
      "exposeWhois": true,
      "metadata": {},
      "tlds": [
        "string"
      ],
      "_createdAt": "string",
      "_modifiedAt": "string",
      "_deleted": true,
      "_revision": 0
    },
    "tech": {
      "contactId": "string",
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "exposeRegistrantOrganization": true,
      "exposeWhois": true,
      "metadata": {},
      "tlds": [
        "string"
      ],
      "_createdAt": "string",
      "_modifiedAt": "string",
      "_deleted": true,
      "_revision": 0
    },
    "billing": {
      "contactId": "string",
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "exposeRegistrantOrganization": true,
      "exposeWhois": true,
      "metadata": {},
      "tlds": [
        "string"
      ],
      "_createdAt": "string",
      "_modifiedAt": "string",
      "_deleted": true,
      "_revision": 0
    }
  },
  "actions": [
    {
      "type": "AUTH_CODE_PURCHASE",
      "origination": "USER",
      "createdAt": "string",
      "startedAt": "string",
      "completedAt": "string",
      "modifiedAt": "string",
      "status": "ACCEPTED",
      "reason": {
        "code": "string",
        "message": "string",
        "fields": [
          {
            "code": "string",
            "message": "string",
            "path": "string",
            "pathRelated": "string"
          }
        ]
      },
      "requestId": "string"
    }
  ],
  "dnssecRecords": [
    {
      "algorithm": "RSAMD5",
      "keyTag": 65536,
      "digestType": "SHA1",
      "digest": "string",
      "flags": "ZSK",
      "publicKey": "string",
      "maxSignatureLife": 0
    }
  ],
  "registryStatusCodes": [
    "ADD_PERIOD"
  ]
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The contact does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`domain` must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain whose change of registrant is to be cancelled

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/CHANGE\_OF\_REGISTRANT\_DELETE to poll status

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The contact does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

There is already a similar action processing

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`domain` must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

502

Dependent service unavailable

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain whose change of registrant information is to be retrieved

Code

Description

200

Request was successful

```
{
  "createDate": "string",
  "gainingContact": {
    "email": "user@example.com",
    "firstName": "string",
    "lastName": "string",
    "organization": "string"
  },
  "losingContact": {
    "email": "user@example.com",
    "firstName": "string",
    "lastName": "string",
    "organization": "string"
  },
  "otherDomainsAffected": 0,
  "shopperEmail": "user@example.com"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The contact does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

There is already a similar action processing

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`domain` must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

502

Dependent service unavailable

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain to add the DNSSEC record for

body \*

array

(body)

DNSSEC records to add

```
[
  {
    "algorithm": "RSAMD5",
    "keyTag": 65536,
    "digestType": "SHA1",
    "digest": "string",
    "flags": "ZSK",
    "publicKey": "string",
    "maxSignatureLife": 0
  }
]
```

Parameter content type

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/DNSSEC\_CREATE to poll status

400

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

401

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

There is already a similar action processing

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Request body doesn't fulfill schema, see details in `fields`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain to delete the DNSSEC record for

body \*

array

(body)

DNSSEC records to remove

```
[
  {
    "algorithm": "RSAMD5",
    "keyTag": 65536,
    "digestType": "SHA1",
    "digest": "string",
    "flags": "ZSK",
    "publicKey": "string",
    "maxSignatureLife": 0
  }
]
```

Parameter content type

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/DNSSEC\_DELETE to poll status

400

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

401

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

There is already a similar action processing

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Request body doesn't fulfill schema, see details in `fields`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain whose name servers are to be replaced

body \*

(body)

Name server records to replace on the domain

```
{
  "nameServers": [
    "string"
  ]
}
```

Parameter content type

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/DOMAIN\_UPDATE\_NAME\_SERVERS to poll status

400

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

401

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

There is already a similar action processing

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Request body doesn't fulfill schema, see details in `fields`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain name whose details are to be retrieved

Code

Description

200

Request was successful

```
{
  "privateEmail": "string",
  "forwardingEmail": "string",
  "emailPreference": "EMAIL_FILTER"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`domain` must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain name whose details are to be retrieved

body \*

(body)

Update privacy email forwarding settings

```
{
  "privateEmailType": "DEFAULT",
  "forwardingEmail": "string",
  "emailPreference": "EMAIL_FILTER"
}
```

Parameter content type

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/PRIVACY\_FORWARDING\_UPDATE to poll status

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

There is already a similar action processing

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Request body doesn't fulfill schema, see details in `fields`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain to request redeem for

body

(body)

Options for redeeming existing Domain

```
{
  "consent": {
    "price": 0,
    "fee": 0,
    "currency": "USD",
    "agreedBy": "string",
    "agreedAt": "string"
  }
}
```

Parameter content type

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/REDEEM to poll status

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

There is already a similar action processing

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Domain invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain to be renewed

body \*

(body)

Options for renewing existing Domain

```
{
  "expires": "string",
  "consent": {
    "price": 0,
    "currency": "USD",
    "registryPremiumPricing": true,
    "agreedBy": "string",
    "agreedAt": "string"
  },
  "period": 10
}
```

Parameter content type

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/RENEW to poll status

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

There is already a similar action processing

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Request body doesn't fulfill schema, see details in `fields`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain to transfer in

body \*

(body)

Details for domain transfer purchase

```
{
  "authCode": "string",
  "period": 1,
  "renewAuto": true,
  "privacy": false,
  "identityDocumentId": "string",
  "consent": {
    "agreementKeys": [
      "string"
    ],
    "price": 0,
    "currency": "USD",
    "registryPremiumPricing": true,
    "agreedBy": "string",
    "agreedAt": "string",
    "claimToken": "string"
  },
  "contacts": {
    "admin": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "adminId": "string",
    "billing": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "billingId": "string",
    "registrant": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "registrantId": "string",
    "tech": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "techId": "string"
  },
  "metadata": {}
}
```

Parameter content type

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/TRANSFER to poll status

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

There is already a similar action processing

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Based on restrictions declared in JSON schema returned by `./schema/{tld}`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain Name

Code

Description

200

Request was successful

```
{
  "transferStatusCodes": [
    "CLIENT_APPROVED"
  ]
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain to transfer in

body \*

(body)

Details for domain transfer purchase

```
{
  "authCode": "string",
  "period": 1,
  "renewAuto": true,
  "privacy": false,
  "identityDocumentId": "string",
  "consent": {
    "agreementKeys": [
      "string"
    ],
    "price": 0,
    "currency": "USD",
    "registryPremiumPricing": true,
    "agreedBy": "string",
    "agreedAt": "string",
    "claimToken": "string"
  },
  "contacts": {
    "admin": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "adminId": "string",
    "billing": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "billingId": "string",
    "registrant": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "registrantId": "string",
    "tech": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "techId": "string"
  },
  "metadata": {}
}
```

Parameter content type

Code

Description

204

Request was successful

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

There is already a similar action processing

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Based on restrictions declared in JSON schema returned by `./schema/{tld}`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain to accept the transfer in for

body \*

object

(body)

An Authorization code for transferring the Domain

```
{
  "authCode": "string"
}
```

Parameter content type

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/TRANSFER\_IN\_ACCEPT to poll status

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

The domain status does not allow performing the operation

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Request body doesn't fulfill schema, see details in `fields`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain to cancel the transfer in for

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/TRANSFER\_IN\_CANCEL to poll status

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

There is already a similar action processing

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain to restart the transfer in

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/TRANSFER\_IN\_RESTART to poll status

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

The domain status does not allow performing the operation

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain to retry the transfer in

body \*

object

(body)

An Authorization code for transferring the Domain

```
{
  "authCode": "string"
}
```

Parameter content type

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/TRANSFER\_IN\_RETRY to poll status

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

The domain status does not allow performing the operation

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Request body doesn't fulfill schema, see details in `fields`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain to initiate the transfer out for

registrar \*

string

(query)

Registrar tag to push transfer to

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/TRANSFER\_OUT\_REQUESTED to poll status

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

There is already a similar action processing

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Domain invalid. TLD must be .uk

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain to accept the transfer out for

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/TRANSFER\_OUT\_ACCEPT to poll status

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

There is already a similar action processing

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain to reject the transfer out for

reason

string

(query)

Transfer out reject reason

*Available values* : EVIDENCE\_OF\_FRAUD, URDP\_ACTION, COURT\_ORDER, DISPUTE\_OVER\_IDENTITY, NO\_PAYMENT\_FOR\_PREVIOUS\_REGISTRATION\_PERIOD, WRITTEN\_OBJECTION, TRANSFERRED\_WITHIN\_SIXTY\_DAYS

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/TRANSFER\_OUT\_REJECT to poll status

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

There is already a similar action processing

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

**Notes:**

-   **shopperId** is **not the same** as **customerId**. **shopperId** is a number of max length 10 digits (*ex:* 1234567890) whereas **customerId** is a UUIDv4 (*ex:* 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

Name

Description

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

fqdn \*

string

(path)

The fully qualified domain name whose forwarding details are to be deleted.

Code

Description

204

Request was successful

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

The domain status does not allow performing the operation

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

A valid `fqdn` must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

**Notes:**

-   **shopperId** is **not the same** as **customerId**. **shopperId** is a number of max length 10 digits (*ex:* 1234567890) whereas **customerId** is a UUIDv4 (*ex:* 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

Name

Description

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

fqdn \*

string

(path)

The fully qualified domain name whose forwarding details are to be retrieved.

includeSubs

boolean

(query)

Optionally include all sub domains if the fqdn specified is a domain and not a sub domain.

Code

Description

200

Request was successful

```
[
  {
    "fqdn": "string",
    "type": "REDIRECT_PERMANENT",
    "url": "string",
    "mask": {
      "title": "string",
      "description": "string",
      "keywords": "string"
    }
  }
]
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

A valid `fqdn` must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

**Notes:**

-   **shopperId** is **not the same** as **customerId**. **shopperId** is a number of max length 10 digits (*ex:* 1234567890) whereas **customerId** is a UUIDv4 (*ex:* 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

Name

Description

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

fqdn \*

string

(path)

The fully qualified domain name whose forwarding details are to be modified.

body \*

(body)

Domain forwarding rule to create or replace on the fqdn

```
{
  "type": "REDIRECT_PERMANENT",
  "url": "string",
  "mask": {
    "title": "string",
    "description": "string",
    "keywords": "string"
  }
}
```

Parameter content type

Code

Description

204

Request was successful

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

The domain status does not allow performing the operation

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Request body doesn't fulfill schema, see details in `fields`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

**Notes:**

-   **shopperId** is **not the same** as **customerId**. **shopperId** is a number of max length 10 digits (*ex:* 1234567890) whereas **customerId** is a UUIDv4 (*ex:* 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

Name

Description

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your own customer id.

fqdn \*

string

(path)

The fully qualified domain name whose forwarding details are to be modified.

body \*

(body)

Domain forwarding rule to create for the specified fqdn

```
{
  "type": "REDIRECT_PERMANENT",
  "url": "string",
  "mask": {
    "title": "string",
    "description": "string",
    "keywords": "string"
  }
}
```

Parameter content type

Code

Description

204

Request was successful

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

Provided `fqdn` already has forwarding setup

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Request body doesn't fulfill schema, see details in `fields`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

body \*

(body)

An instance document expected to match the JSON schema returned by `./schema/{tld}`

```
{
  "domain": "string",
  "consent": {
    "agreementKeys": [
      "string"
    ],
    "price": 0,
    "currency": "USD",
    "registryPremiumPricing": true,
    "agreedBy": "string",
    "agreedAt": "string",
    "claimToken": "string"
  },
  "period": 1,
  "nameServers": [
    "string"
  ],
  "renewAuto": true,
  "privacy": false,
  "contacts": {
    "admin": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "adminId": "string",
    "billing": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "billingId": "string",
    "registrant": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "registrantId": "string",
    "tech": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "techId": "string"
  },
  "metadata": {}
}
```

Parameter content type

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/REGISTER to poll status

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

There is already a similar action processing

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Based on restrictions declared in JSON schema returned by `./schema/{tld}`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

tld \*

string

(path)

The Top-Level Domain whose schema should be retrieved

Code

Description

200

Request was successful

```
{
  "id": "string",
  "models": {},
  "properties": {},
  "required": [
    "string"
  ]
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The tld does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`tld` must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

body \*

(body)

An instance document expected to match the JSON schema returned by `./schema/{tld}`

```
{
  "domain": "string",
  "consent": {
    "agreementKeys": [
      "string"
    ],
    "price": 0,
    "currency": "USD",
    "registryPremiumPricing": true,
    "agreedBy": "string",
    "agreedAt": "string",
    "claimToken": "string"
  },
  "period": 1,
  "nameServers": [
    "string"
  ],
  "renewAuto": true,
  "privacy": false,
  "contacts": {
    "admin": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "adminId": "string",
    "billing": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "billingId": "string",
    "registrant": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "registrantId": "string",
    "tech": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "techId": "string"
  },
  "metadata": {}
}
```

Parameter content type

Code

Description

204

Request was successful

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The customer does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Based on restrictions declared in JSON schema returned by `./schema/{tld}`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

status

string

(query)

Only include results with the selected `status` value. Returns all results if omitted  

-   **ACTIVE** - The upcoming maintenance is active.
-   **CANCELLED** - The upcoming maintenance has been cancelled.

*Available values* : ACTIVE, CANCELLED

modifiedAtAfter

string($iso-datetime)

(query)

Only include results with `modifiedAt` after the supplied date

startsAtAfter

string($iso-datetime)

(query)

Only include results with `startsAt` after the supplied date

limit

integer

(query)

Maximum number of results to return

*Default value* : 100

Code

Description

200

Request was successful

```
{
  "createdAt": "string",
  "endsAt": "string",
  "environment": "OTE",
  "maintenanceId": "string",
  "modifiedAt": "string",
  "reason": "EMERGENCY",
  "startsAt": "string",
  "status": "ACTIVE",
  "summary": "string",
  "tlds": [
    "string"
  ],
  "type": "API"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Filter parameters don't match schema and/or restrictions

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

maintenanceId \*

string

(path)

The identifier for the system maintenance

Code

Description

200

Request was successful

```
{
  "createdAt": "string",
  "endsAt": "string",
  "environment": "OTE",
  "maintenanceId": "string",
  "modifiedAt": "string",
  "reason": "EMERGENCY",
  "startsAt": "string",
  "status": "ACTIVE",
  "summary": "string",
  "systems": [
    {
      "name": "DOMAIN_CHECKS",
      "impact": [
        "DELAYED"
      ]
    }
  ],
  "tlds": [
    "string"
  ],
  "type": "API"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The maintenance does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

yyyymm \*

string

(path)

The year/month timeframe for the request counts (in the format yyyy-mm)

includes

array\[string\]

(query)

Determines if the detail records (grouped by request path) are included in the response

*Available values* : details

Code

Description

200

Request was successful

```
{
  "details": [
    {
      "path": "string",
      "total": 0
    }
  ],
  "quota": 0,
  "total": 0,
  "yyyymm": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

### [Actions](#/Actions)

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain whose actions are to be retrieved

Code

Description

200

Request was successful

```
[
  {
    "type": "AUTH_CODE_PURCHASE",
    "origination": "USER",
    "createdAt": "string",
    "startedAt": "string",
    "completedAt": "string",
    "modifiedAt": "string",
    "status": "ACCEPTED",
    "reason": {
      "code": "string",
      "message": "string",
      "fields": [
        {
          "code": "string",
          "message": "string",
          "path": "string",
          "pathRelated": "string"
        }
      ]
    },
    "requestId": "string"
  }
]
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain whose action is to be cancelled

type \*

string

(path)

The type of action to cancel

*Available values* : AUTH\_CODE\_PURCHASE, AUTH\_CODE\_REGENERATE, BACKORDER\_PURCHASE, BACKORDER\_DELETE, BACKORDER\_UPDATE, CHANGE\_OF\_REGISTRANT\_DELETE, DNSSEC\_CREATE, DNSSEC\_DELETE, DOMAIN\_DELETE, DOMAIN\_UPDATE, DOMAIN\_UPDATE\_CONTACTS, DOMAIN\_UPDATE\_NAME\_SERVERS, MIGRATE, PRIVACY\_FORWARDING\_UPDATE, PRIVACY\_PURCHASE, PRIVACY\_DELETE, REDEEM, REGISTER, RENEW, RENEW\_UNDO, TRADE, TRADE\_CANCEL, TRADE\_PURCHASE, TRADE\_PURCHASE\_AUTH\_TEXT\_MESSAGE, TRADE\_RESEND\_AUTH\_EMAIL, TRANSFER, TRANSFER\_IN\_ACCEPT, TRANSFER\_IN\_CANCEL, TRANSFER\_IN\_RESTART, TRANSFER\_IN\_RETRY, TRANSFER\_OUT\_ACCEPT, TRANSFER\_OUT\_REJECT, TRANSFER\_OUT\_REQUESTED, TRANSIT

Code

Description

204

Request was successful

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

The action status does not allow performing the operation

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain whose action is to be retrieved

type \*

string

(path)

The type of action to retrieve

*Available values* : AUTH\_CODE\_PURCHASE, AUTH\_CODE\_REGENERATE, AUTO\_RENEWAL, BACKORDER\_PURCHASE, BACKORDER\_DELETE, BACKORDER\_UPDATE, CHANGE\_OF\_REGISTRANT\_DELETE, DNS\_VERIFICATION, DNSSEC\_CREATE, DNSSEC\_DELETE, DOMAIN\_DELETE, DOMAIN\_UPDATE, DOMAIN\_UPDATE\_CONTACTS, DOMAIN\_UPDATE\_NAME\_SERVERS, EXPIRY, ICANN\_VERIFICATION, MIGRATE, MIGRATE\_IN, PREMIUM, PRIVACY\_FORWARDING\_UPDATE, PRIVACY\_PURCHASE, PRIVACY\_DELETE, REDEEM, REGISTER, RENEW, RENEW\_UNDO, TRADE, TRADE\_CANCEL, TRADE\_PURCHASE, TRADE\_PURCHASE\_AUTH\_TEXT\_MESSAGE, TRADE\_RESEND\_AUTH\_EMAIL, TRANSFER, TRANSFER\_IN, TRANSFER\_IN\_ACCEPT, TRANSFER\_IN\_CANCEL, TRANSFER\_IN\_RESTART, TRANSFER\_IN\_RETRY, TRANSFER\_OUT, TRANSFER\_OUT\_ACCEPT, TRANSFER\_OUT\_REJECT, TRANSFER\_OUT\_REQUESTED, TRANSIT

Code

Description

200

Request was successful

```
{
  "type": "AUTH_CODE_PURCHASE",
  "origination": "USER",
  "createdAt": "string",
  "startedAt": "string",
  "completedAt": "string",
  "modifiedAt": "string",
  "status": "ACCEPTED",
  "reason": {
    "code": "string",
    "message": "string",
    "fields": [
      {
        "code": "string",
        "message": "string",
        "path": "string",
        "pathRelated": "string"
      }
    ]
  },
  "requestId": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

The domain status does not allow performing the operation

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

### [Notifications](#/Notifications)

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

Code

Description

200

Request was successful

```
{
  "notificationId": "",
  "type": "AUTH_CODE_PURCHASE",
  "resource": "",
  "resourceType": "CONTACT",
  "status": "AWAITING",
  "addedAt": "",
  "requestId": "string",
  "metadata": ""
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The customer does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

Code

Description

200

Request was successful

```
[
  {
    "notificationId": "",
    "type": "AUTH_CODE_PURCHASE",
    "resource": "",
    "resourceType": "CONTACT",
    "status": "AWAITING",
    "addedAt": "",
    "requestId": "string",
    "metadata": ""
  }
]
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The customer does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

types \*

array\[string\]

(query)

The notification types that should be opted in

*Available values* : AUTH\_CODE\_PURCHASE, AUTH\_CODE\_REGENERATE, AUTO\_RENEWAL, BACKORDER, BACKORDER\_PURCHASE, BACKORDER\_DELETE, BACKORDER\_UPDATE, CHANGE\_OF\_REGISTRANT\_DELETE, CONTACT\_CREATE, CONTACT\_DELETE, CONTACT\_UPDATE, DNS\_VERIFICATION, DNSSEC\_CREATE, DNSSEC\_DELETE, DOMAIN\_DELETE, DOMAIN\_UPDATE, DOMAIN\_UPDATE\_CONTACTS, DOMAIN\_UPDATE\_NAME\_SERVERS, EXPIRY, HOST\_CREATE, HOST\_DELETE, ICANN\_VERIFICATION, MIGRATE, MIGRATE\_IN, PREMIUM, PRIVACY\_FORWARDING\_UPDATE, PRIVACY\_PURCHASE, PRIVACY\_DELETE, REDEEM, REGISTER, RENEW, RENEW\_UNDO, TRADE, TRADE\_CANCEL, TRADE\_PURCHASE, TRADE\_PURCHASE\_AUTH\_TEXT\_MESSAGE, TRADE\_RESEND\_AUTH\_EMAIL, TRANSFER, TRANSFER\_IN, TRANSFER\_IN\_ACCEPT, TRANSFER\_IN\_CANCEL, TRANSFER\_IN\_RESTART, TRANSFER\_IN\_RETRY, TRANSFER\_OUT, TRANSFER\_OUT\_ACCEPT, TRANSFER\_OUT\_REJECT, TRANSFER\_OUT\_REQUESTED, TRANSIT

Code

Description

204

Command successful

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The customer does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`type` must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

type \*

string

(path)

The notification type whose schema should be retrieved

*Available values* : AUTO\_RENEWAL, BACKORDER, BACKORDER\_PURCHASE, EXPIRY, PREMIUM, PRIVACY\_PURCHASE, REDEEM, REGISTER, RENEW, TRADE, TRANSFER

Code

Description

200

Request was successful

```
{
  "id": "string",
  "models": {},
  "properties": {},
  "required": [
    "string"
  ]
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The schema type does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

`type` must be specified

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

notificationId \*

string

(path)

The notification ID to acknowledge

Code

Description

204

Message acknowledged

401

Authentication info not sent or invalid

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

### [Contacts](#/Contacts)

Name

Description

X-Request-Id

string

(header)

A client provided identifier for tracking this request.

customerId \*

string

(path)

The Customer identifier  
Note: For API Resellers, performing actions on behalf of your customers, you need to specify the Subaccount you're operating on behalf of; otherwise use your shopper id.

domain \*

string

(path)

Domain whose Contacts are to be updated.

body \*

(body)

Changes to apply to existing Contacts

```
{
  "identityDocumentId": "string",
  "contacts": {
    "admin": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "adminId": "string",
    "billing": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "billingId": "string",
    "registrant": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "registrantId": "string",
    "tech": {
      "encoding": "ASCII",
      "nameFirst": "string",
      "nameMiddle": "string",
      "nameLast": "string",
      "organization": "string",
      "jobTitle": "string",
      "email": "user@example.com",
      "phone": "string",
      "fax": "string",
      "addressMailing": {
        "address1": "string",
        "address2": "string",
        "city": "string",
        "country": "US",
        "postalCode": "string",
        "state": "string"
      },
      "metadata": {}
    },
    "techId": "string"
  }
}
```

Parameter content type

Code

Description

202

Request Accepted. You may use GET /v2/customers/{customerId}/domains/{domain}/actions/DOMAIN\_UPDATE\_CONTACTS to poll status

400

Request was malformed

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

404

The domain does not exist

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

409

There is already a similar action processing

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

422

Request body doesn't fulfill schema, see details in `fields`

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

429

Too many requests received within interval

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

---

*Generated on: 2025-11-09T04:57:36.973Z*
*Source: https://developer.godaddy.com/doc/endpoint/domains*
