# Documentation: Subscriptions API

**URL:** https://developer.godaddy.com/doc/endpoint/subscriptions

**Documentation Name:** Subscriptions API

**Endpoints Found:** 5

**Endpoints Expanded:** 5

**Endpoints Extracted:** 5

---

## API Endpoints

### GET /v1/subscriptions

**Name:** /v1/subscriptions

**Description:** GET/v1/subscriptionsRetrieve a list of Subscriptions for the specified Shopper

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-App-Key | string | A unique application key identifying the source of the request. This is required for request tracking | Yes | header |
| X-Shopper-Id | string | Shopper ID to return subscriptions for when not using JWT | No | header |
| X-Market-Id | string | The market that the response should be formatted for | No | header |
| productGroupKeys | array[string] | Only return Subscriptions with the specified product groups | No | query |
| includes | array[string] | Optional details to be included in the response | No | query |
| offset | integer | Number of Subscriptions to skip before starting to return paged results (must be a multiple of the limit) | No | query |
| limit | integer | Number of Subscriptions to retrieve in this page, starting after offset | No | query |
| sort | string | Property name that will be used to sort results. "-" indicates descending | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 422 | Invalid query parameter (custom message returned for each parameter) |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v1/subscriptions/productGroups

**Name:** /v1/subscriptions/productGroups

**Description:** GET/v1/subscriptions/productGroupsRetrieve a list of ProductGroups for the specified Shopper

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-App-Key | string | A unique application key identifying the source of the request. This is required for request tracking | Yes | header |
| X-Shopper-Id | string | Shopper ID to return data for when not using JWT | No | header |

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

### DELETE /v1/subscriptions/{subscriptionId}

**Name:** /v1/subscriptions/{subscriptionId}

**Description:** DELETE/v1/subscriptions/{subscriptionId}Cancel the specified Subscription

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-App-Key | string | A unique application key identifying the source of the request. This is required for request tracking | Yes | header |
| X-Shopper-Id | string | Shopper ID to return data for when not using JWT | No | header |
| subscriptionId | string | Unique identifier of the Subscription to cancel | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 204 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | Failed to determine if the domain is protected (invalid domain ID)Invalid Subscription IdThe Office 365 Subscription cannot be cancelled (shopper is migrating)The Subscription cannot be cancelledThe Subscription cannot be cancelled (PFID is disabled for cancellation)The Subscription cannot be cancelled (domain is protected)The domain alert Subscription cannot be cancelled |
| 429 | Too many requests received within interval |
| 500 | Failed to determine if the Office 365 account is migratingFailed to determine if the domain alert is cancellableFailed to determine if the domain is protectedInternal server error |
| 504 | Gateway timeout |

---

### GET /v1/subscriptions/{subscriptionId}

**Name:** /v1/subscriptions/{subscriptionId}

**Description:** GET/v1/subscriptions/{subscriptionId}Retrieve details for the specified Subscription

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-App-Key | string | A unique application key identifying the source of the request. This is required for request tracking | Yes | header |
| X-Shopper-Id | string | Shopper ID to be operated on, if different from JWT | No | header |
| subscriptionId | string | Unique identifier of the Subscription to retrieve | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | Invalid Subscription Id |
| 429 | Too many requests received within interval |
| 500 | Internal server error |
| 504 | Gateway timeout |

---

### PATCH /v1/subscriptions/{subscriptionId}

**Name:** /v1/subscriptions/{subscriptionId}

**Description:** Only Subscription properties that can be changed without immediate financial impact can be modified via PATCH, whereas some properties can be changed by purchasing a renewalThis endpoint only supports JWT authentication

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-App-Key | string | A unique application key identifying the source of the request. This is required for request tracking | Yes | header |
| X-Shopper-Id | string | Shopper ID to be operated on, if different from JWT | No | header |
| subscriptionId | string | Unique identifier of the Subscription to update | Yes | path |
| subscription | string | Details of the Subscription to change | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "paymentProfileId": 0,
  "renewAuto": true
}
```

#### Responses

| Code | Description |
|------|-------------|
| 204 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access  This method only supports JWT authentication |
| 404 | Subscription not found  Payment profile not found |
| 500 | Internal server error |

---

## Full Documentation

# Untitled

### [v1](#/v1)

Name

Description

X-App-Key \*

string

(header)

A unique application key identifying the source of the request. This is required for request tracking

X-Shopper-Id

string

(header)

Shopper ID to return subscriptions for when not using JWT

X-Market-Id

string

(header)

The market that the response should be formatted for

*Default value* : en-US

productGroupKeys

array\[string\]

(query)

Only return Subscriptions with the specified product groups

includes

array\[string\]

(query)

Optional details to be included in the response

offset

integer

(query)

Number of Subscriptions to skip before starting to return paged results (must be a multiple of the limit)

*Default value* : 0

limit

integer

(query)

Number of Subscriptions to retrieve in this page, starting after offset

*Default value* : 25

sort

string

(query)

Property name that will be used to sort results. "-" indicates descending

*Available values* : expiresAt, -expiresAt

*Default value* : -expiresAt

Code

Description

200

Request was successful

```
{
  "pagination": {
    "first": "string",
    "last": "string",
    "next": "string",
    "previous": "string",
    "total": 0
  },
  "subscriptions": [
    {
      "addons": [
        {
          "commitment": "PAID",
          "pfid": 0,
          "quantity": 0
        }
      ],
      "billing": {
        "commitment": "PAID",
        "pastDueTypes": [
          "ADDON"
        ],
        "renewAt": "string",
        "status": "CURRENT"
      },
      "cancelable": true,
      "createdAt": "string",
      "expiresAt": "string",
      "label": "string",
      "launchUrl": "string",
      "paymentProfileId": 0,
      "priceLocked": true,
      "product": {
        "label": "string",
        "namespace": "string",
        "pfid": 0,
        "productGroupKey": "string",
        "renewalPeriod": 0,
        "renewalPeriodUnit": "MONTH",
        "renewalPfid": 0,
        "supportBillOn": true
      },
      "relations": {
        "children": [
          "string"
        ],
        "parent": "string"
      },
      "renewAuto": true,
      "renewable": true,
      "status": "ACTIVE",
      "subscriptionId": "string",
      "upgradeable": true
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

Invalid query parameter (custom message returned for each parameter)

```
{
  "code": "string",
  "fields": [
    {
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

X-App-Key \*

string

(header)

A unique application key identifying the source of the request. This is required for request tracking

X-Shopper-Id

string

(header)

Shopper ID to return data for when not using JWT

Code

Description

200

Request was successful

```
[
  {
    "productGroupKey": "string",
    "subscriptionCount": 0
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

X-App-Key \*

string

(header)

A unique application key identifying the source of the request. This is required for request tracking

X-Shopper-Id

string

(header)

Shopper ID to return data for when not using JWT

subscriptionId \*

string

(path)

Unique identifier of the Subscription to cancel

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

Failed to determine if the domain is protected (invalid domain ID)  
Invalid Subscription Id  
The Office 365 Subscription cannot be cancelled (shopper is migrating)  
The Subscription cannot be cancelled  
The Subscription cannot be cancelled (PFID is disabled for cancellation)  
The Subscription cannot be cancelled (domain is protected)  
The domain alert Subscription cannot be cancelled

```
{
  "code": "string",
  "fields": [
    {
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

Failed to determine if the Office 365 account is migrating  
Failed to determine if the domain alert is cancellable  
Failed to determine if the domain is protected  
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

X-App-Key \*

string

(header)

A unique application key identifying the source of the request. This is required for request tracking

X-Shopper-Id

string

(header)

Shopper ID to be operated on, if different from JWT

subscriptionId \*

string

(path)

Unique identifier of the Subscription to retrieve

Code

Description

200

Request was successful

```
{
  "addons": [
    {
      "commitment": "PAID",
      "pfid": 0,
      "quantity": 0
    }
  ],
  "billing": {
    "commitment": "PAID",
    "pastDueTypes": [
      "ADDON"
    ],
    "renewAt": "string",
    "status": "CURRENT"
  },
  "cancelable": true,
  "createdAt": "string",
  "expiresAt": "string",
  "label": "string",
  "launchUrl": "string",
  "paymentProfileId": 0,
  "priceLocked": true,
  "product": {
    "label": "string",
    "namespace": "string",
    "pfid": 0,
    "productGroupKey": "string",
    "renewalPeriod": 0,
    "renewalPeriodUnit": "MONTH",
    "renewalPfid": 0,
    "supportBillOn": true
  },
  "relations": {
    "children": [
      "string"
    ],
    "parent": "string"
  },
  "renewAuto": true,
  "renewable": true,
  "status": "ACTIVE",
  "subscriptionId": "string",
  "upgradeable": true
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

Invalid Subscription Id

```
{
  "code": "string",
  "fields": [
    {
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

Only Subscription properties that can be changed without immediate financial impact can be modified via PATCH, whereas some properties can be changed by purchasing a renewal  
**This endpoint only supports JWT authentication**

Name

Description

X-App-Key \*

string

(header)

A unique application key identifying the source of the request. This is required for request tracking

X-Shopper-Id

string

(header)

Shopper ID to be operated on, if different from JWT

subscriptionId \*

string

(path)

Unique identifier of the Subscription to update

subscription \*

(body)

Details of the Subscription to change

```
{
  "paymentProfileId": 0,
  "renewAuto": true
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
This method only supports JWT authentication

```
{
  "code": "string",
  "fields": [
    {
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

Subscription not found  
Payment profile not found

```
{
  "code": "string",
  "fields": [
    {
      "code": "string",
      "message": "string",
      "path": "string",
      "pathRelated": "string"
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
      "path": "string",
      "pathRelated": "string"
    }
  ],
  "message": "string"
}
```

---

*Generated on: 2025-11-09T04:57:45.682Z*
*Source: https://developer.godaddy.com/doc/endpoint/subscriptions*
