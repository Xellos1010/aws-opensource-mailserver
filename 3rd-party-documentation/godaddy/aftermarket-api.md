# Documentation: Aftermarket API

**URL:** https://developer.godaddy.com/doc/endpoint/aftermarket

**Documentation Name:** Aftermarket API

**Endpoints Found:** 3

**Endpoints Expanded:** 3

**Endpoints Extracted:** 3

---

## API Endpoints

### GET /v1/customers/{customerId}/auctions/listings

**Name:** /v1/customers/{customerId}/auctions/listings

**Description:** GET/v1/customers/{customerId}/auctions/listingsGet listings from GoDaddy Auctions

**Tag:** Expiry Auctions: Registrar Partners

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| customerId | string | An identifier for a customer. | Yes | path |
| domains | string | Only include results for the specified domains. Use comma-separated string to include more than one domain. For example, one.com,two.info,three.biz | No | query |
| listingStatus | string | Only include results for the specified listing status. | No | query |
| transferBefore | string($iso-datetime) | Domain transfer time before this time, ISO 8601, in UTC. Defaults to last day of the previous month if not provided. Applicable only for listings in FULFILLED listingStatus. | No | query |
| transferAfter | string($iso-datetime) | Domain transfer time after this time, ISO 8601, in UTC. Defaults to first day of the previous month if not provided. Applicable only for listings in FULFILLED listingStatus. | No | query |
| limit | integer($integer-positive) | Maximum number of items to return. | No | query |
| offset | integer($integer-positive) | Number of results to skip for pagination. | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 422 | Required parameters must be specified in correct format |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### DELETE /v1/aftermarket/listings

**Name:** /v1/aftermarket/listings

**Description:** DELETE/v1/aftermarket/listingsRemove listings from GoDaddy Auction

**Tag:** Expiry Auctions: Registrar Partners

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| domains | array[string] | A comma separated list of domain names | Yes | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 422 | Required parameters must be specified in correct format
Example ValueModel{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
} |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### POST /v1/aftermarket/listings/expiry

**Name:** /v1/aftermarket/listings/expiry

**Description:** POST/v1/aftermarket/listings/expiryAdd expiry listings into GoDaddy Auction

**Tag:** Expiry Auctions: Registrar Partners

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| expiryListings | array | An array of expiry listings to be loaded | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
[
  {
    "domain": "string",
    "expiresAt": "string",
    "losingRegistrarId": 1,
    "pageViewsMonthly": 0,
    "revenueMonthly": 0
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
| 422 | Required parameters must be specified in correct formatToo many Listings providedInvalid Losing Registrar Id |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

## Full Documentation

# Untitled

### [Expiry Auctions: Registrar Partners](#/Expiry%20Auctions:%20Registrar%20Partners)

API for auction-related actions exclusive to whitelisted partners.

Name

Description

customerId \*

string

(path)

An identifier for a customer.

domains

string

(query)

Only include results for the specified domains. Use comma-separated string to include more than one domain. For example, `one.com,two.info,three.biz`

listingStatus

string

(query)

Only include results for the specified listing status.

*Available values* : FULFILLED

transferBefore

string($iso-datetime)

(query)

Domain transfer time before this time, ISO 8601, in UTC. Defaults to last day of the previous month if not provided. Applicable only for listings in `FULFILLED` listingStatus.

transferAfter

string($iso-datetime)

(query)

Domain transfer time after this time, ISO 8601, in UTC. Defaults to first day of the previous month if not provided. Applicable only for listings in `FULFILLED` listingStatus.

limit

integer($integer-positive)

(query)

Maximum number of items to return.

offset

integer($integer-positive)

(query)

Number of results to skip for pagination.

Code

Description

200

Request was successful

```
{
  "listings": [
    {
      "listingId": 0,
      "domainName": "string",
      "domainCreatedAt": "string",
      "domainExpiresAt": "string",
      "domainRegistrarIanaId": 0,
      "pageViewsMonthly": 0,
      "revenueMonthly": 0,
      "auctionStartAt": "2022-04-01T02:07:14Z",
      "auctionEndAt": "2022-04-10T02:07:14Z",
      "auctionTransferAt": "2022-04-15T02:07:14Z",
      "auctionSoldAt": "2022-04-20T02:07:14Z",
      "auctionBookingAmountUsd": 0,
      "createdAt": "string",
      "updatedAt": "string"
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

Required parameters must be specified in correct format

```
{
  "code": "string",
  "fields": [
    {
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

(query)

A comma separated list of domain names

Code

Description

200

Request was successful

```
{
  "listingActionId": 0
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

```
Required parameters must be specified in correct format
```

```
{
  "code": "string",
  "fields": [
    {
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

expiryListings \*

array

(body)

An array of expiry listings to be loaded

```
[
  {
    "domain": "string",
    "expiresAt": "string",
    "losingRegistrarId": 1,
    "pageViewsMonthly": 0,
    "revenueMonthly": 0
  }
]
```

Parameter content type

Code

Description

200

Request was successful

```
{
  "listingActionId": 0
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

Required parameters must be specified in correct format  
Too many Listings provided  
Invalid Losing Registrar Id

```
{
  "code": "string",
  "fields": [
    {
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

*Generated on: 2025-11-09T04:55:35.272Z*
*Source: https://developer.godaddy.com/doc/endpoint/aftermarket*
