# Open source release — announcement copy

Use the sections below for **GitHub Releases** and **LinkedIn**. Replace placeholders before publishing.

**Placeholders**

| Token | Replace with |
|-------|----------------|
| `REPO_URL` | Your public Git clone URL (e.g. `https://github.com/your-org/aws-opensource-mailserver`) |
| `BLOG_URL` | `https://aws.amazon.com/blogs/opensource/fully-automated-deployment-of-an-open-source-mail-server-on-aws/` |

---

## GitHub Release (title + body)

**Suggested release title:** `Open source release — Mail-in-a-Box on AWS toolkit`

**Suggested tag:** `v0.1.0` (or your semver)

**Body (markdown):**

```markdown
We’re open-sourcing our **Mail-in-a-Box on AWS** automation toolkit: CDK reference apps, operational scripts, optional CMS components, and documentation for running a resilient single-instance mail server with S3 backups and optional SES.

### What’s in the repo

- **Reference CDK layout** — `apps/clients/cdk-client-example/` (core, instance, observability) with Nx targets for synth/deploy and operational tasks.
- **Libraries & tools** — AWS helpers, infra naming, 100+ `tools/*.cli.ts` scripts for backups, DNS, cost, and incidents.
- **Docs** — [docs/public/creating-a-mail-deployment-client.md](docs/public/creating-a-mail-deployment-client.md) explains how to fork the reference “client” for your own domain; [docs/public/mail-server-operations.md](docs/public/mail-server-operations.md) is the operations guide.

### Getting started

- **CloudFormation quick path:** see the root [README](README.md) and the AWS blog walkthrough: https://aws.amazon.com/blogs/opensource/fully-automated-deployment-of-an-open-source-mail-server-on-aws/
- **CDK / monorepo path:** Node 20+, pnpm; then follow the walkthrough linked above.

### License

MIT-0 (see [LICENSE](LICENSE)). No warranty; review security and backup procedures before production use.

**Repository:** REPO_URL
```

---

## LinkedIn post (short)

**Option A — technical audience**

We’ve released our **Mail-in-a-Box on AWS** toolkit as open source: CDK apps for core + instance + observability, shared infra libraries, and a large set of operational CLIs—plus docs for deploying MIAB with S3 backups and optional SES.

If you want **self-hosted mail** without running your own distribution fork, this repo is meant to shorten the path from “idea” to “working stack” and to document how we operate it.

→ Repo link: REPO_URL  
→ Background on the single-instance pattern: https://aws.amazon.com/blogs/opensource/fully-automated-deployment-of-an-open-source-mail-server-on-aws/

#OpenSource #AWS #MailInABox #DevOps #CloudComputing

**Option B — broader**

Running your own mail server used to mean weekends lost to DNS, TLS, and backups. This project open-sources how we automate **Mail-in-a-Box on AWS**: infrastructure as code, backups to S3, optional SES relay, and runbooks for day-two operations.

Explore the code and docs: REPO_URL

#OpenSource #AWS #EmailInfrastructure

---

## Notes for maintainers

- Do not paste customer domains, ARNs, or bucket names into public posts.
- After publishing the release, add the same link to the root README “Related” section if desired.
