# Documentation: Orders API

**URL:** https://developer.godaddy.com/doc/endpoint/orders

**Documentation Name:** Orders API

**Endpoints Found:** 2

**Endpoints Expanded:** 2

**Endpoints Extracted:** 2

---

## API Endpoints

### GET /v1/orders

**Name:** /v1/orders

**Description:** API ResellersThis endpoint does not support subaccounts and therefore API Resellers should not supply an X-Shopper-Id header

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| periodStart | string | Start of range indicating what time-frame should be returned. Inclusive | No | query |
| periodEnd | string | End of range indicating what time-frame should be returned. Inclusive | No | query |
| domain | string | Domain name to use as the filter of results | No | query |
| productGroupId | integer | Product group id to use as the filter of results | No | query |
| paymentProfileId | integer | Payment profile id to use as the filter of results | No | query |
| parentOrderId | string | Parent order id to use as the filter of results | No | query |
| offset | integer | Number of results to skip for pagination | No | query |
| limit | integer | Maximum number of items to return | No | query |
| sort | string | Property name that will be used to sort results. '-' indicates descending | No | query |
| X-Shopper-Id | string | Shopper ID to be operated on, if different from JWTReseller subaccounts are not supported | No | header |
| X-App-Key | string | A unique application key identifying the source of the request. This is required for request tracking | Yes | header |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 429 | Too many requests received within interval |
| 500 | Internal server error |
| 504 | Gateway timeout |

---

### GET /v1/orders/{orderId}

**Name:** /v1/orders/{orderId}

**Description:** API ResellersThis endpoint does not support subaccounts and therefore API Resellers should not supply an X-Shopper-Id header

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| orderId | string | Order id whose details are to be retrieved | Yes | path |
| X-Shopper-Id | string | Shopper ID to be operated on, if different from JWTReseller subaccounts are not supported | No | header |
| X-Market-Id | string | Unique identifier of the Market in which the request is happening | No | header |
| X-App-Key | string | A unique application key identifying the source of the request. This is required for request tracking | Yes | header |

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
| 504 | Gateway timeout |

---

## Full Documentation

# Untitled

### [v1](#/v1)

**API Resellers**

-   This endpoint does not support subaccounts and therefore API Resellers should not supply an X-Shopper-Id header

Name

Description

periodStart

string

(query)

Start of range indicating what time-frame should be returned. Inclusive

periodEnd

string

(query)

End of range indicating what time-frame should be returned. Inclusive

domain

string

(query)

Domain name to use as the filter of results

productGroupId

integer

(query)

Product group id to use as the filter of results

paymentProfileId

integer

(query)

Payment profile id to use as the filter of results

parentOrderId

string

(query)

Parent order id to use as the filter of results

offset

integer

(query)

Number of results to skip for pagination

*Default value* : 0

limit

integer

(query)

Maximum number of items to return

*Default value* : 25

sort

string

(query)

Property name that will be used to sort results. '-' indicates descending

*Available values* : createdAt, -createdAt, orderId, -orderId, pricing.total, -pricing.total

*Default value* : -createdAt

X-Shopper-Id

string

(header)

Shopper ID to be operated on, if different from JWT  
**Reseller subaccounts are not supported**

X-App-Key \*

string

(header)

A unique application key identifying the source of the request. This is required for request tracking

Code

Description

200

Request was successful

```
{
  "orders": [
    {
      "createdAt": "string",
      "currency": "string",
      "items": [
        {
          "label": "string"
        }
      ],
      "orderId": "string",
      "parentOrderId": "string",
      "pricing": {
        "total": "string"
      }
    }
  ],
  "pagination": {
    "first": "string",
    "last": "string",
    "next": "string",
    "previous": "string",
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

**API Resellers**

-   This endpoint does not support subaccounts and therefore API Resellers should not supply an X-Shopper-Id header

Name

Description

orderId \*

string

(path)

Order id whose details are to be retrieved

X-Shopper-Id

string

(header)

Shopper ID to be operated on, if different from JWT  
**Reseller subaccounts are not supported**

X-Market-Id

string

(header)

Unique identifier of the Market in which the request is happening

*Default value* : en-US

X-App-Key \*

string

(header)

A unique application key identifying the source of the request. This is required for request tracking

Code

Description

200

Request was successful

```
{
  "billTo": {
    "contact": {
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
    "taxId": "string"
  },
  "createdAt": "string",
  "currency": "string",
  "items": [
    {
      "domains": [
        "string"
      ],
      "label": "string",
      "period": 1,
      "periodUnit": "MONTH",
      "pfid": 0,
      "pricing": {
        "discount": 0,
        "fees": {
          "icann": 0,
          "total": 0
        },
        "list": 0,
        "sale": 0,
        "savings": 0,
        "subtotal": 0,
        "taxes": 0,
        "unit": {}
      },
      "quantity": 0,
      "taxCollector": {
        "taxCollectorId": 0
      }
    }
  ],
  "orderId": "string",
  "parentOrderId": "string",
  "payments": [
    {
      "amount": 0,
      "category": "CREDIT_CARD",
      "paymentProfileId": "string",
      "subcategory": "CHECKING_PERSONAL"
    }
  ],
  "pricing": {
    "discount": 0,
    "fees": {
      "icann": 0,
      "total": 0
    },
    "id": 0,
    "list": 0,
    "savings": 0,
    "subtotal": 0,
    "taxes": 0,
    "taxDetails": [
      {
        "amount": 0,
        "rate": 0
      }
    ],
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

---

*Generated on: 2025-11-09T04:56:08.832Z*
*Source: https://developer.godaddy.com/doc/endpoint/orders*
