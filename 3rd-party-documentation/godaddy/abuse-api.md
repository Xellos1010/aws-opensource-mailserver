# Documentation: Abuse API

**URL:** https://developer.godaddy.com/doc/endpoint/abuse

**Documentation Name:** Abuse API

**Endpoints Found:** 6

**Endpoints Expanded:** 6

**Endpoints Extracted:** 6

---

## API Endpoints

### GET /v1/abuse/tickets

**Name:** /v1/abuse/tickets

**Description:** GET/v1/abuse/ticketsList all abuse tickets ids that match user provided filters

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| type | string | The type of abuse. | No | query |
| closed | boolean | Is this abuse ticket closed? | No | query |
| sourceDomainOrIp | string($host-name-or-ip-address) | The domain name or ip address the abuse originated from | No | query |
| target | string | The brand/company the abuse is targeting. ie: brand name/bank name | No | query |
| createdStart | string($iso-datetime) | The earliest abuse ticket creation date to pull abuse tickets for | No | query |
| createdEnd | string($iso-datetime) | The latest abuse ticket creation date to pull abuse tickets for | No | query |
| limit | integer($integer-positive) | Number of abuse ticket numbers to return. | No | query |
| offset | integer($integer-positive) | The earliest result set record number to pull abuse tickets for | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Success |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 422 | Error |

---

### POST /v1/abuse/tickets

**Name:** /v1/abuse/tickets

**Description:** POST/v1/abuse/ticketsCreate a new abuse ticket

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| body | object | The endpoint which allows the Reporter to create a new abuse ticket | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "info": "string",
  "infoUrl": "string",
  "source": "string",
  "target": "string",
  "intentional": false,
  "proxy": "string",
  "type": "A_RECORD"
}
```

#### Responses

| Code | Description |
|------|-------------|
| 201 | Success |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 422 | Error |

---

### GET /v1/abuse/tickets/{ticketId}

**Name:** /v1/abuse/tickets/{ticketId}

**Description:** GET/v1/abuse/tickets/{ticketId}Return the abuse ticket data for a given ticket id

**Tag:** v1

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| ticketId | string | A unique abuse ticket identifier | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Success |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Invalid ticket id provided |

---

### GET /v2/abuse/tickets

**Name:** /v2/abuse/tickets

**Description:** GET/v2/abuse/ticketsList all abuse tickets ids that match user provided filters

**Tag:** v2

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| type | string | The type of abuse. | No | query |
| closed | boolean | Is this abuse ticket closed? | No | query |
| sourceDomainOrIp | string($host-name-or-ip-address) | The domain name or ip address the abuse originated from | No | query |
| target | string | The brand/company the abuse is targeting. ie: brand name/bank name | No | query |
| createdStart | string($iso-datetime) | The earliest abuse ticket creation date to pull abuse tickets for | No | query |
| createdEnd | string($iso-datetime) | The latest abuse ticket creation date to pull abuse tickets for | No | query |
| limit | integer($integer-positive) | Number of abuse ticket numbers to return. | No | query |
| offset | integer($integer-positive) | The earliest result set record number to pull abuse tickets for | No | query |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Success |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 422 | Error |

---

### POST /v2/abuse/tickets

**Name:** /v2/abuse/tickets

**Description:** POST/v2/abuse/ticketsCreate a new abuse ticket

**Tag:** v2

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| body | object | The endpoint which allows the Reporter to create a new abuse ticket | Yes | body |

#### Request Body

**Content Type:** application/json

**Example:**

```json
{
  "info": "string",
  "infoUrl": "string",
  "source": "string",
  "target": "string",
  "type": "CHILD_ABUSE",
  "proxy": "ARE",
  "useragent": "DESKTOP"
}
```

#### Responses

| Code | Description |
|------|-------------|
| 201 | Success |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 422 | Error |

---

### GET /v2/abuse/tickets/{ticketId}

**Name:** /v2/abuse/tickets/{ticketId}

**Description:** GET/v2/abuse/tickets/{ticketId}Return the abuse ticket data for a given ticket id

**Tag:** v2

#### Parameters

| Name | Type | Description | Required | Location |
|------|------|-------------|----------|----------|
| ticketId | string | A unique abuse ticket identifier | Yes | path |

#### Responses

| Code | Description |
|------|-------------|
| 200 | Success |
| 401 | Authentication info not sent or invalid |
| 403 | Authenticated user is not allowed access |
| 404 | Invalid ticket id provided |

---

## Full Documentation

# Untitled

### [v1](#/v1)

Name

Description

type

string

(query)

The type of abuse.

*Available values* : A\_RECORD, CHILD\_ABUSE, CONTENT, FRAUD\_WIRE, IP\_BLOCK, MALWARE, NETWORK\_ABUSE, PHISHING, SPAM

closed

boolean

(query)

Is this abuse ticket closed?

*Default value* : false

sourceDomainOrIp

string($host-name-or-ip-address)

(query)

The domain name or ip address the abuse originated from

target

string

(query)

The brand/company the abuse is targeting. ie: brand name/bank name

createdStart

string($iso-datetime)

(query)

The earliest abuse ticket creation date to pull abuse tickets for

createdEnd

string($iso-datetime)

(query)

The latest abuse ticket creation date to pull abuse tickets for

limit

integer($integer-positive)

(query)

Number of abuse ticket numbers to return.

*Default value* : 100

offset

integer($integer-positive)

(query)

The earliest result set record number to pull abuse tickets for

*Default value* : 0

Code

Description

200

Success

```
{
  "pagination": {
    "first": "string",
    "last": "string",
    "next": "string",
    "previous": "string",
    "total": 0
  },
  "ticketIds": [
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
  "message": "string",
  "stack": [
    "string"
  ]
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
  "message": "string",
  "stack": [
    "string"
  ]
}
```

422

Error

```
{
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
  "stack": [
    "string"
  ]
}
```

Name

Description

body \*

object

(body)

The endpoint which allows the Reporter to create a new abuse ticket

```
{
  "info": "string",
  "infoUrl": "string",
  "source": "string",
  "target": "string",
  "intentional": false,
  "proxy": "string",
  "type": "A_RECORD"
}
```

Parameter content type

Code

Description

201

Success

```
{
  "u_number": "string"
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
  "message": "string",
  "stack": [
    "string"
  ]
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
  "message": "string",
  "stack": [
    "string"
  ]
}
```

422

Error

```
{
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
  "stack": [
    "string"
  ]
}
```

Name

Description

ticketId \*

string

(path)

A unique abuse ticket identifier

Code

Description

200

Success

```
{
  "closed": false,
  "closedAt": "string",
  "createdAt": "string",
  "domainIp": "string",
  "reporter": "string",
  "source": "string",
  "target": "string",
  "ticketId": "string",
  "type": "A_RECORD"
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
  "message": "string",
  "stack": [
    "string"
  ]
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
  "message": "string",
  "stack": [
    "string"
  ]
}
```

404

Invalid ticket id provided

```
{
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
  "stack": [
    "string"
  ]
}
```

### [v2](#/v2)

An incremental update that keeps the endpoints largely the same, but deprecates some commonly misused parameters and add some features to ensure reports can be worked quicker.

Name

Description

type

string

(query)

The type of abuse.

*Available values* : A\_RECORD, CHILD\_ABUSE, CONTENT, FRAUD\_WIRE, IP\_BLOCK, MALWARE, NETWORK\_ABUSE, PHISHING, SPAM

closed

boolean

(query)

Is this abuse ticket closed?

*Default value* : false

sourceDomainOrIp

string($host-name-or-ip-address)

(query)

The domain name or ip address the abuse originated from

target

string

(query)

The brand/company the abuse is targeting. ie: brand name/bank name

createdStart

string($iso-datetime)

(query)

The earliest abuse ticket creation date to pull abuse tickets for

createdEnd

string($iso-datetime)

(query)

The latest abuse ticket creation date to pull abuse tickets for

limit

integer($integer-positive)

(query)

Number of abuse ticket numbers to return.

*Default value* : 100

offset

integer($integer-positive)

(query)

The earliest result set record number to pull abuse tickets for

*Default value* : 0

Code

Description

200

Success

```
{
  "pagination": {
    "first": "string",
    "last": "string",
    "next": "string",
    "previous": "string",
    "total": 0
  },
  "ticketIds": [
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
  "message": "string",
  "stack": [
    "string"
  ]
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
  "message": "string",
  "stack": [
    "string"
  ]
}
```

422

Error

```
{
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
  "stack": [
    "string"
  ]
}
```

Name

Description

body \*

object

(body)

The endpoint which allows the Reporter to create a new abuse ticket

```
{
  "info": "string",
  "infoUrl": "string",
  "source": "string",
  "target": "string",
  "type": "CHILD_ABUSE",
  "proxy": "ARE",
  "useragent": "DESKTOP"
}
```

Parameter content type

Code

Description

201

Success

```
{
  "u_number": "string"
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
  "message": "string",
  "stack": [
    "string"
  ]
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
  "message": "string",
  "stack": [
    "string"
  ]
}
```

422

Error

```
{
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
  "stack": [
    "string"
  ]
}
```

Name

Description

ticketId \*

string

(path)

A unique abuse ticket identifier

Code

Description

200

Success

```
{
  "closed": false,
  "closedAt": "string",
  "createdAt": "string",
  "domainIp": "string",
  "reporter": "string",
  "source": "string",
  "target": "string",
  "ticketId": "string",
  "type": "A_RECORD",
  "closeReason": "ACTIONED"
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
  "message": "string",
  "stack": [
    "string"
  ]
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
  "message": "string",
  "stack": [
    "string"
  ]
}
```

404

Invalid ticket id provided

```
{
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
  "stack": [
    "string"
  ]
}
```

---

*Generated on: 2025-11-09T04:55:37.276Z*
*Source: https://developer.godaddy.com/doc/endpoint/abuse*
