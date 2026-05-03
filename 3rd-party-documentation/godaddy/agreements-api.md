# Documentation: Agreements API

**URL:** https://developer.godaddy.com/doc/endpoint/agreements

**Documentation Name:** Agreements API

**Endpoints Found:** 1

**Endpoints Expanded:** 1

**Endpoints Extracted:** 1

---

## API Endpoints

### GET /v1/agreements

**Name:** /v1/agreements

**Description:** GET/v1/agreementsRetrieve Legal Agreements for provided agreements keys

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| X-Private-Label-Id | integer | PrivateLabelId to operate as, if different from JWT | No | header |
| X-Market-Id | string($bcp-47) | Unique identifier of the Market used to retrieve/translate Legal Agreements | No | header |
| keys | array[string] | Keys for Agreements whose details are to be retrieved | Yes | query |

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

## Full Documentation

# Untitled

### [v1](#/v1)

Name

Description

X-Private-Label-Id

integer

(header)

PrivateLabelId to operate as, if different from JWT

X-Market-Id

string($bcp-47)

(header)

Unique identifier of the Market used to retrieve/translate Legal Agreements

*Default value* : en-US

keys \*

array\[string\]

(query)

Keys for Agreements whose details are to be retrieved

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

*Generated on: 2025-11-09T04:55:46.944Z*
*Source: https://developer.godaddy.com/doc/endpoint/agreements*
