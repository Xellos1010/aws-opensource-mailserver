# Documentation: Shoppers API

**URL:** https://developer.godaddy.com/doc/endpoint/shoppers

**Documentation Name:** Shoppers API

**Endpoints Found:** 6

**Endpoints Expanded:** 6

**Endpoints Extracted:** 6

---

## API Endpoints

### POST /v1/shoppers/subaccount

**Name:** /v1/shoppers/subaccount

**Description:** POST/v1/shoppers/subaccountCreate a Subaccount owned by the authenticated Reseller

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| subaccount | string | The subaccount to create | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "email": "user@example.com",
  "externalId": 0,
  "marketId": "en-US",
  "nameFirst": "string",
  "nameLast": "string",
  "password": "string"
}
```

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 422 | subaccount does not fulfill the schema |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v1/shoppers/{shopperId}

**Name:** /v1/shoppers/{shopperId}

**Description:** Notes:shopperId is not the same as customerId.  shopperId is a number of max length 10 digits (ex: 1234567890) whereas customerId is a UUIDv4 (ex: 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| shopperId | string | Shopper whose details are to be retrieved | Yes | path |
| includes | array[string] | Additional properties to be included in the response shopper object | No | query |

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

### POST /v1/shoppers/{shopperId}

**Name:** /v1/shoppers/{shopperId}

**Description:** Notes:shopperId is not the same as customerId.  shopperId is a number of max length 10 digits (ex: 1234567890) whereas customerId is a UUIDv4 (ex: 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| shopperId | string | The ID of the Shopper to update | Yes | path |
| shopper | string | The Shopper details to update | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "email": "user@example.com",
  "externalId": 0,
  "marketId": "da-DK",
  "nameFirst": "string",
  "nameLast": "string"
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
| 422 | Shopper does not fulfill the schema |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### DELETE /v1/shoppers/{shopperId}

**Name:** /v1/shoppers/{shopperId}

**Description:** Notes:Shopper deletion is not supported in OTEshopperId is not the same as customerId.  shopperId is a number of max length 10 digits (ex: 1234567890) whereas customerId is a UUIDv4 (ex: 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| shopperId | string | The ID of the shopper to delete. Must agree with the shopper id on the token or header, if present. Note: shopperId is not the same as customerId.  shopperId is a number of max length 10 digits (ex: 1234567890) whereas customerId is a UUIDv4 (ex: 295e3bc3-b3b9-4d95-aae5-ede41a994d13) | Yes | path |
| auditClientIp | string | The client IP of the user who originated the request leading to this call. | Yes | query |

#### Responses

| Code | Description |
|------|-------------|
| 204 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 409 | Active and locked shoppers cannot be deleted |
| 422 | Shopper ID is not supplied or invalid |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v1/shoppers/{shopperId}/status

**Name:** /v1/shoppers/{shopperId}/status

**Description:** Notes:shopperId is not the same as customerId. shopperId is a number of max length 10 digits (ex: 1234567890) whereas customerId is a UUIDv4 (ex: 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| shopperId | string | The ID of the shopper to retrieve. Must agree with the shopper id on the token or header, if present | Yes | path |
| auditClientIp | string | The client IP of the user who originated the request leading to this call. | Yes | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was malformed |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Resource not found |
| 422 | Shopper ID is not supplied or invalid |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### PUT /v1/shoppers/{shopperId}/factors/password

**Name:** /v1/shoppers/{shopperId}/factors/password

**Description:** Notes:Password set is only supported by API Resellers setting subaccount passwords.shopperId is not the same as customerId.  shopperId is a number of max length 10 digits (ex: 1234567890) whereas customerId is a UUIDv4 (ex: 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| shopperId | string | Shopper whose password will be set | Yes | path |
| secret | string | The value to set the subaccount's password to | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "secret": "P@55w0rd+"
}
```

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 400 | Request was not successful |
| 401 | Authentication info not sent or invalid |
| 500 | Internal server error |

---

## Full Documentation

# Untitled

### [v1](#/v1)

Name

Description

subaccount \*

(body)

The subaccount to create

```
{
  "email": "user@example.com",
  "externalId": 0,
  "marketId": "en-US",
  "nameFirst": "string",
  "nameLast": "string",
  "password": "string"
}
```

Parameter content type

Code

Description

200

Request was successful

```
{
  "customerId": "string",
  "shopperId": "string"
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

`subaccount` does not fulfill the schema

```
{
  "code": "string",
  "fields": [
    {
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

shopperId \*

string

(path)

Shopper whose details are to be retrieved

includes

array\[string\]

(query)

Additional properties to be included in the response shopper object

*Available values* : customerId

Code

Description

200

Request was successful

```
{
  "customerId": "string",
  "email": "user@example.com",
  "externalId": 0,
  "marketId": "en-US",
  "nameFirst": "string",
  "nameLast": "string",
  "shopperId": "string"
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

**Notes:**

-   **shopperId** is **not the same** as **customerId**. **shopperId** is a number of max length 10 digits (*ex:* 1234567890) whereas **customerId** is a UUIDv4 (*ex:* 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

Name

Description

shopperId \*

string

(path)

The ID of the Shopper to update

shopper \*

(body)

The Shopper details to update

```
{
  "email": "user@example.com",
  "externalId": 0,
  "marketId": "da-DK",
  "nameFirst": "string",
  "nameLast": "string"
}
```

Parameter content type

Code

Description

200

Request was successful

```
{
  "customerId": "string",
  "shopperId": "string"
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

`Shopper` does not fulfill the schema

```
{
  "code": "string",
  "fields": [
    {
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

-   Shopper deletion is not supported in OTE
-   **shopperId** is **not the same** as **customerId**. **shopperId** is a number of max length 10 digits (*ex:* 1234567890) whereas **customerId** is a UUIDv4 (*ex:* 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

Name

Description

shopperId \*

string

(path)

The ID of the shopper to delete. Must agree with the shopper id on the token or header, if present. *Note*: **shopperId** is **not the same** as **customerId**. **shopperId** is a number of max length 10 digits (*ex:* 1234567890) whereas **customerId** is a UUIDv4 (*ex:* 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

auditClientIp \*

string

(query)

The client IP of the user who originated the request leading to this call.

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

409

Active and locked shoppers cannot be deleted

```
{
  "code": "string",
  "fields": [
    {
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

Shopper ID is not supplied or invalid

```
{
  "code": "string",
  "fields": [
    {
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

shopperId \*

string

(path)

The ID of the shopper to retrieve. Must agree with the shopper id on the token or header, if present

auditClientIp \*

string

(query)

The client IP of the user who originated the request leading to this call.

Code

Description

200

Request was successful

```
{
  "billingState": "ABANDONED"
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

Shopper ID is not supplied or invalid

```
{
  "code": "string",
  "fields": [
    {
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

-   Password set is only supported by API Resellers setting subaccount passwords.
-   **shopperId** is **not the same** as **customerId**. **shopperId** is a number of max length 10 digits (*ex:* 1234567890) whereas **customerId** is a UUIDv4 (*ex:* 295e3bc3-b3b9-4d95-aae5-ede41a994d13)

Name

Description

shopperId \*

string

(path)

Shopper whose password will be set

secret \*

(body)

The value to set the subaccount's password to

```
{
  "secret": "P@55w0rd+"
}
```

Parameter content type

Code

Description

200

Request was successful

```
{
  "customerId": "string",
  "shopperId": "string"
}
```

400

Request was not successful

```
{
  "type": "string",
  "code": "PW_BLACK_LIST",
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

*Generated on: 2025-11-09T04:57:45.022Z*
*Source: https://developer.godaddy.com/doc/endpoint/shoppers*
