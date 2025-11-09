# Documentation: Parking API

**URL:** https://developer.godaddy.com/doc/endpoint/parking

**Documentation Name:** Parking API

**Endpoints Found:** 2

**Endpoints Expanded:** 2

**Endpoints Extracted:** 2

---

## API Endpoints

### GET /v1/customers/{customerId}/parking/metrics

**Name:** /v1/customers/{customerId}/parking/metrics

**Description:** GET/v1/customers/{customerId}/parking/metricsReturns a list of parking metrics for the specified customer, using specified filters

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| customerId | string | An identifier for a customer. A special alias MY is supported when accessing the authenticated customer's own data | Yes | path |
| periodStartPtz | string($date) | Start of range indicating what time-frame should be returned, inclusive. ISO 8601 date YYYY-MM-DD in PT. Default value is the day before current date | No | query |
| periodEndPtz | string($date) | End of range indicating what time-frame should be returned, inclusive. ISO 8601 date YYYY-MM-DD in PT. Default value is the day before current date | No | query |
| limit | integer | Maximum number of items to return | No | query |
| offset | integer | Number of results to skip for pagination | No | query |
| X-Request-Id | string | A unique identifier for the request | No | header |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 422 | Required parameters must be specified in correct format |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

### GET /v1/customers/{customerId}/parking/metricsByDomain

**Name:** /v1/customers/{customerId}/parking/metricsByDomain

**Description:** GET/v1/customers/{customerId}/parking/metricsByDomainReturns a list of domain metrics for the specified customer and portfolio, using specified filters

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| customerId | string | An identifier for a customer. A special alias MY is supported when accessing the authenticated customer's own data | Yes | path |
| startDate | string($date) | Start of range indicating what time-frame should be returned, inclusive. ISO 8601 date YYYY-MM-DD | Yes | query |
| endDate | string($date) | End of range indicating what time-frame should be returned, inclusive. ISO 8601 date YYYY-MM-DD | Yes | query |
| domains | string | An array of domains to filter the results. If this filter is not provided, all domains will be returned | No | query |
| domainLike | string | represent search keyword filtering domains. If not null, domains will be ignored | No | query |
| portfolioId | string($uuid) | Unique identifier for the portfolio to filter the results. If not provided, all domains within all porfolios will be returned | No | query |
| limit | integer | Maximum number of items to return | No | query |
| offset | integer | Number of results to skip for pagination | No | query |
| X-Request-Id | string | A unique identifier for the request | No | header |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Request was successful |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 422 | Required parameters must be specified in correct format |
| 429 | Too many requests received within interval |
| 500 | Internal server error |

---

## Full Documentation

# Untitled

### [v1](#/v1)

Name

Description

customerId \*

string

(path)

An identifier for a customer. A special alias MY is supported when accessing the authenticated customer's own data

periodStartPtz

string($date)

(query)

Start of range indicating what time-frame should be returned, ***inclusive***. ISO 8601 date `YYYY-MM-DD` in PT. Default value is the day before current date

periodEndPtz

string($date)

(query)

End of range indicating what time-frame should be returned, ***inclusive***. ISO 8601 date `YYYY-MM-DD` in PT. Default value is the day before current date

limit

integer

(query)

Maximum number of items to return

*Default value* : 20

offset

integer

(query)

Number of results to skip for pagination

*Default value* : 0

X-Request-Id

string

(header)

A unique identifier for the request

Code

Description

200

Request was successful

```
{
  "currencyId": "USD",
  "metrics": [
    {
      "adClickCount": 4,
      "periodPtz": "2020-02-05",
      "revenue": 4000000,
      "visitCount": 22
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

customerId \*

string

(path)

An identifier for a customer. A special alias MY is supported when accessing the authenticated customer's own data

startDate \*

string($date)

(query)

Start of range indicating what time-frame should be returned, inclusive. ISO 8601 date YYYY-MM-DD

endDate \*

string($date)

(query)

End of range indicating what time-frame should be returned, inclusive. ISO 8601 date YYYY-MM-DD

domains

string

(query)

An array of domains to filter the results. If this filter is not provided, all domains will be returned

domainLike

string

(query)

represent search keyword filtering domains. If not null, `domains` will be ignored

portfolioId

string($uuid)

(query)

Unique identifier for the portfolio to filter the results. If not provided, all domains within all porfolios will be returned

limit

integer

(query)

Maximum number of items to return

*Default value* : 20

offset

integer

(query)

Number of results to skip for pagination

*Default value* : 0

X-Request-Id

string

(header)

A unique identifier for the request

Code

Description

200

Request was successful

```
{
  "currencyId": "USD",
  "metrics": [
    {
      "adClickCount": 3,
      "domain": "example.com",
      "pageViewCount": 4,
      "revenue": 3000000,
      "visitCount": 30
    }
  ],
  "pagination": {
    "first": "string",
    "last": "string",
    "next": "string",
    "previous": "string",
    "total": 0
  },
  "startDate": "string",
  "endDate": "string"
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

---

*Generated on: 2025-11-09T04:57:42.810Z*
*Source: https://developer.godaddy.com/doc/endpoint/parking*
