Mail user API (advanced)

Use your box’s mail user API to add/change/remove users from the command-line or custom services you build.

Usage:

curl -X VERB [-d "parameters"] --user {email}:{password} https://box.[domain].com/admin/mail/users[action]
Brackets denote an optional argument. Please note that the POST body parameters must be URL-encoded.

The email and password given to the --user option must be an administrative user on this system.

Verbs
Verb	Action	
GET	(none)	Returns a list of existing mail users. Adding ?format=json to the URL will give JSON-encoded results.
POST	/add	Adds a new mail user. Required POST-body parameters are email and password.
POST	/remove	Removes a mail user. Required POST-body parameter is email.
POST	/privileges/add	Used to make a mail user an admin. Required POST-body parameters are email and privilege=admin.
POST	/privileges/remove	Used to remove the admin privilege from a mail user. Required POST-body parameter is email.
Examples:

Try these examples. For simplicity the examples omit the --user me@mydomain.com:yourpassword command line argument which you must fill in with your administrative email address and password.

# Gives a JSON-encoded list of all mail users
curl -X GET https://box.askdaokapra.com/admin/mail/users?format=json

# Adds a new email user
curl -X POST -d "email=new_user@mydomail.com" -d "password=s3curE_pa5Sw0rD" https://box.askdaokapra.com/admin/mail/users/add

# Removes a email user
curl -X POST -d "email=new_user@mydomail.com" https://box.askdaokapra.com/admin/mail/users/remove

# Adds admin privilege to an email user
curl -X POST -d "email=new_user@mydomail.com" -d "privilege=admin" https://box.askdaokapra.com/admin/mail/users/privileges/add

# Removes admin privilege from an email user
curl -X POST -d "email=new_user@mydomail.com" https://box.askdaokapra.com/admin/mail/users/privileges/remove
