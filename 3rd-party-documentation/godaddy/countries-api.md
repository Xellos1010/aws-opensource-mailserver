# Documentation: Countries API

**URL:** https://developer.godaddy.com/doc/endpoint/countries

**Documentation Name:** Countries API

**Endpoints Found:** 2

**Endpoints Expanded:** 2

**Endpoints Extracted:** 2

---

## API Endpoints

### GET /v1/countries

**Name:** /v1/countries

**Description:** Authorization is not required

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| marketId | string($bcp-47) | MarketId in which the request is being made, and for which responses should be localized | Yes | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 422 | marketId is required |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v1/countries/{countryKey}

**Name:** /v1/countries/{countryKey}

**Description:** Authorization is not required

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| countryKey | string($iso-country-code) | The country key | Yes | path |
| marketId | string($bcp-47) | MarketId in which the request is being made, and for which responses should be localized | Yes | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 404 | Country not found |
| 422 | marketId is required |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

## Full Documentation

# Untitled

### [v1](#/v1)

Authorization is not required

Name

Description

marketId \*

string($bcp-47)

(query)

MarketId in which the request is being made, and for which responses should be localized

Code

Description

200

Request was successful

```
[
  {
    "callingCode": "string",
    "countryKey": "string",
    "label": "string"
  }
]
```

422

marketId is required

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
      "path": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0,
  "stack": [
    "string"
  ]
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
  "message": "string",
  "stack": [
    "string"
  ]
}
```

Authorization is not required

Name

Description

countryKey \*

string($iso-country-code)

(path)

The country key

marketId \*

string($bcp-47)

(query)

MarketId in which the request is being made, and for which responses should be localized

Code

Description

200

Request was successful

```
[
  {
    "callingCode": "string",
    "countryKey": "string",
    "label": "string",
    "states": [
      {
        "label": "string",
        "stateKey": "string"
      }
    ]
  }
]
```

404

Country not found

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
  "message": "string",
  "stack": [
    "string"
  ]
}
```

422

marketId is required

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
      "path": "string"
    }
  ],
  "message": "string",
  "retryAfterSec": 0,
  "stack": [
    "string"
  ]
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
  "message": "string",
  "stack": [
    "string"
  ]
}
```

---

*Generated on: 2025-11-09T04:56:09.190Z*
*Source: https://developer.godaddy.com/doc/endpoint/countries*
