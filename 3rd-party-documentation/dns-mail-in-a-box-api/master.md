Custom DNS API

Use your box’s DNS API to set custom DNS records on domains hosted here. For instance, you can create your own dynamic DNS service.

Usage:

curl -X VERB [-d "value"] --user {email}:{password} https://box.[domain].com/admin/dns/custom[/qname[/rtype]]
(Brackets denote an optional argument.)

Verbs

Verb	Usage
GET	Returns matching custom DNS records as a JSON array of objects. Each object has the keys qname, rtype, and value. The optional qname and rtype parameters in the request URL filter the records returned in the response. The request body (-d "...") must be omitted.
PUT	Sets a custom DNS record replacing any existing records with the same qname and rtype. Use PUT (instead of POST) when you only have one value for a qname and rtype, such as typical A records (without round-robin).
POST	Adds a new custom DNS record. Use POST when you have multiple TXT records or round-robin A records. (PUT would delete previously added records.)
DELETE	Deletes custom DNS records. If the request body (-d "...") is empty or omitted, deletes all records matching the qname and rtype. If the request body is present, deletes only the record matching the qname, rtype and value.
Parameters

Parameter	Value
email	The email address of any administrative user here.
password	That user’s password.
qname	The fully qualified domain name for the record you are trying to set. It must be one of the domain names or a subdomain of one of the domain names hosted on this box. (Add mail users or aliases to add new domains.)
rtype	The resource type. Defaults to A if omitted. Possible values: A (an IPv4 address), AAAA (an IPv6 address), TXT (a text string), CNAME (an alias, which is a fully qualified domain name — don’t forget the final period), MX, SRV, SSHFP, CAA or NS.
value	For PUT, POST, and DELETE, the record’s value. If the rtype is A or AAAA and value is empty or omitted, the IPv4 or IPv6 address of the remote host is used (be sure to use the -4 or -6 options to curl). This is handy for dynamic DNS!
Strict SPF and DMARC records will be added to all custom domains unless you override them.

Examples:

Try these examples. For simplicity the examples omit the --user me@mydomain.com:yourpassword command line argument which you must fill in with your email address and password.

# sets laptop.mydomain.com to point to the IP address of the machine you are executing curl on
curl -X PUT https://box.askdaokapra.com/admin/dns/custom/laptop.mydomain.com

# deletes that record and all A records for that domain name
curl -X DELETE https://box.askdaokapra.com/admin/dns/custom/laptop.mydomain.com

# sets a CNAME alias
curl -X PUT -d "bar.mydomain.com." https://box.askdaokapra.com/admin/dns/custom/foo.mydomain.com/cname

# deletes that CNAME and all CNAME records for that domain name
curl -X DELETE https://box.askdaokapra.com/admin/dns/custom/foo.mydomain.com/cname

# adds a TXT record using POST to preserve any previous TXT records
curl -X POST -d "some text here" https://box.askdaokapra.com/admin/dns/custom/foo.mydomain.com/txt

# deletes that one TXT record while preserving other TXT records
curl -X DELETE -d "some text here" https://box.askdaokapra.com/admin/dns/custom/foo.mydomain.com/txt