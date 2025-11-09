# Documentation: Auctions API

**URL:** https://developer.godaddy.com/doc/endpoint/auctions

**Documentation Name:** Auctions API

**Endpoints Found:** 1

**Endpoints Expanded:** 1

**Endpoints Extracted:** 1

---

## API Endpoints

### POST /v1/customers/{customerId}/aftermarket/listings/bids

**Name:** /v1/customers/{customerId}/aftermarket/listings/bids

**Description:** POST/v1/customers/{customerId}/aftermarket/listings/bidsPlaces multiple bids with a single request.

**Tag:** Auctions

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| customerId | string | An identifier for a customer. | Yes | path |
| requestBody | array | An array of bids to be placed. | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
[
  {
    "bidAmountUsd": 0,
    "tosAccepted": true,
    "listingId": 555555
  }
]
```

#### Responses

| Code | Description |
|------|-------------|
| 200 | All bids placed successfully. |
| 207 | Partial success. |
| 400 | Query string and/or request body are malformed |
| 401 | Authentication info not sent or is invalid |
| 403 | Authenticated user is not allowed access |
| 422 | Application-specific request error |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

## Full Documentation

# Untitled

## Auctions API ```
 1.0.0 
``` 

### [Auctions](#/Auctions)

An API for Auctions related actions.

Name

Description

customerId \*

string

(path)

An identifier for a customer.

requestBody \*

array

(body)

An array of bids to be placed.

```
[
  {
    "bidAmountUsd": 0,
    "tosAccepted": true,
    "listingId": 555555
  }
]
```

Parameter content type

Code

Description

200

All bids placed successfully.

```
[
  {
    "listingId": 200000,
    "isHighestBidder": "true",
    "bidId": "e8f0a45d-53c6-49e5-a1f2-08b993960e1b",
    "bidAmountUsd": 100000000,
    "status": "SUCCESS"
  }
]
```

207

Partial success.

```
[
  {
    "listingId": 200000,
    "isHighestBidder": "true",
    "bidId": "e8f0a45d-53c6-49e5-a1f2-08b993960e1b",
    "bidAmountUsd": 100000000,
    "status": "SUCCESS"
  },
  {
    "listingId": 300000,
    "bidAmountUsd": 100000000,
    "bidFailureReason": "BID_MIN_NOT_MET",
    "status": "FAILED"
  }
]
```

400

Query string and/or request body are malformed

```
{
  "code": "MALFORMED_INPUT",
  "message": "The request was malformed"
}
```

401

Authentication info not sent or is invalid

```
{
  "code": "UNABLE_TO_AUTHENTICATE",
  "message": "Unauthorized : Could not authenticate API key/secret"
}
```

403

Authenticated user is not allowed access

```
{
  "code": "MISSING_CREDENTIALS",
  "message": "Unauthorized : Credentials must be specified"
}
```

422

Application-specific request error

```
{
  "code": "DUPLICATE_BIDS",
  "message": "Bidding request contains multiple bids for listingID 200000"
}
```

429

Too many requests received within interval

```
{
  "code": "TOO_MANY_REQUESTS",
  "message": "Too many requests received within interval"
}
```

500

Internal server error

```
{
  "code": "SERVER_ERROR",
  "message": "Internal server error"
}
```

---

*Generated on: 2025-11-09T04:55:46.943Z*
*Source: https://developer.godaddy.com/doc/endpoint/auctions*
