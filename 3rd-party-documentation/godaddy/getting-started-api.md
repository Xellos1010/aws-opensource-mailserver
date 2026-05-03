# Get Started

**URL:** https://developer.godaddy.com/getstarted

**Documentation Name:** Getting Started API

**Endpoints Found:** 0

**Endpoints Expanded:** 0

**Endpoints Extracted:** 0

---

## Full Documentation

# Untitled

### Overview

The GoDaddy API is comprised of a number of Application Programming Interfaces ("API or APIs") that enable the customization of experiences in managing and interacting with GoDaddy’s products, services and/or systems and includes, but is not limited to, APIs identified at [developer.godaddy.com/doc](https://developer.godaddy.com/doc) and all others which GoDaddy may, from time to time, make available (collectively referred to as the "GoDaddy API"). By using the GoDaddy API, you agree to be bound by these Terms of Use, as well as the provisions of any supplemental terms of use applicable to specific-use APIs, all of which govern your access to and use of the GoDaddy API.

### API Access, Usage, and Limitations

-   Each GoDaddy API endpoint has a limit on the number of requests per minute (60 requests). You must not exceed or circumvent these limits or otherwise cause excessive or unreasonable load on the GoDaddy API, the GoDaddy website, or any other GoDaddy services, products, or systems.
    
-   Users are not permitted to create GoDaddy API keys on behalf of other GoDaddy customers. API Keys can only be created by GoDaddy customers for their accounts.
    
-   Users are prohibited from deploying or otherwise making available third-party portals, platforms, or mechanisms that enable GoDaddy API key creation.
    
-   Users shall not employ the GoDaddy API to register, transfer, renew, or modify domains or products that are not under the user’s direct control.
    
-   Users shall not attempt to access, modify, or delete any data tied to an account not under their direct control.
    
-   Users or other entities shall not charge any fees, require any payment or compensation, or otherwise offer a service behind a paywall that uses any part of the GoDaddy API or offer any services or products that use or rely on the GoDaddy API, including any services or products offered to users by third parties.
    
-   The GoDaddy API shall not be used to interfere with, disrupt, damage, or harm the GoDaddy API, the GoDaddy website, or any other GoDaddy services, products, systems, or customers. You must not use the GoDaddy API to perform any malicious, fraudulent, illegal, or unauthorized activities or to transmit any harmful or objectionable content, data, or materials.
    
-   Users shall not use the GoDaddy API in connection with activities that infringe or misappropriate the intellectual property rights of GoDaddy or any of its entities. Third-party connectors, connections, or services must not use the GoDaddy name, logo, trademark, patents, or any other GoDaddy intellectual property to imply or otherwise suggest an affiliation with, endorsement from, or sponsorship by GoDaddy.
    
-   Access to parts of our Domains API in Production may require meeting certain criteria: Availability API: Limited to accounts with 50 or more domains. Management and DNS APIs: Limited to accounts with 10 or more domains and/or an active Discount Domain Club – Domain Pro Plan.
    

### API Changes

We reserve the right to modify, update, suspend, or discontinue any part or feature of the GoDaddy API at any time and for any reason without any prior notice or liability to you.

### API Suspension, Termination, and Revocation

We may, at our sole discretion, elect to terminate your eligibility to use the GoDaddy API, or revoke your API keys, if you breach or violate any of these Terms of Use, or for any other reason that we deem appropriate. You agree that we are not liable to you or any third-party for any termination or revocation of your eligibility to use the GoDaddy API, or your API keys, under any circumstances.

### Disclaimer of Warranties and Limitation of Liability

The GoDaddy API is provided on an "as is" and "as available" basis, without any warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, accuracy, completeness, reliability, security, or non-infringement. You acknowledge and agree that your use of the GoDaddy API is at your own risk and discretion and that you are solely responsible for any damages, losses, costs, or expenses that may result from your use of the GoDaddy API or your reliance on any information or data obtained through the GoDaddy API. To the fullest extent permitted by law, we and our affiliates, subsidiaries, officers, directors, employees, agents, licensors, and partners disclaim any liability for any direct, indirect, incidental, consequential, special, exemplary, or punitive damages, or any other damages of any kind, arising out of or in connection with your use of the GoDaddy API, or your inability to use the GoDaddy API, even if we have been advised of the possibility of such damages. Some jurisdictions do not allow the exclusion or limitation of certain damages, so some of the above exclusions or limitations may not apply to you.

### Indemnification

You agree to protect, defend, indemnify and hold harmless GoDaddy and its officers, directors, employees, agents, and third-party service providers from and against any and all claims, demands, costs, expenses, losses, liabilities and damages of every kind and nature (including, without limitation, reasonable attorneys’ fees) imposed upon or incurred by GoDaddy directly or indirectly arising from (i) your use of and access to the GoDaddy API; and (ii) your violation of any provision of these Terms of Use.

### Setup

**Note:** If you are an API Reseller, you are already set up to go. Refer to the [Reseller Control Center](https://reseller.godaddy.com/) for help.

You will need to do the following before using the GoDaddy API:

1.  **Get Access**
    
    You will need an [API Key and Secret](https://developer.chrome.com/keys) to authenticate and authorize your requests.
    
    The first API Key that you create will be a test key and should be used for your development against our OTE environment which is hosted at [https://api.ote-godaddy.com](https://api.ote-godaddy.com/). Integrate first with the OTE environment to verify that you are calling the API properly before going live with calls to the Production environment.
    
    When you are ready for production, create a new API Key and Secret to call our production environment which is hosted at [https://api.godaddy.com](https://api.godaddy.com/).
    
2.  **Set up Good as Gold**
    
    If you need to purchase any products such as a domain, you will need a [Good as Gold](https://godaddy.com/help/what-is-good-as-gold-3359) account to complete transactions. The API will deduct the fixed rates of your purchase from this account so be sure to fund it accordingly.
    
    *Note: The GoDaddy API does not provide any payment processor or payment gateway. To collect money from your customers, you will need to set up your own payment processors.*

---

*Generated on: 2025-11-09T04:55:40.929Z*
*Source: https://developer.godaddy.com/getstarted*
