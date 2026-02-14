import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CmsApiClient, Contact, FeatureFlags } from '../api';

interface FlashMessage {
  tone: 'success' | 'error' | 'info';
  text: string;
}

const TOKEN_KEY = 'cms_access_token';

export function App() {
  const [api] = useState(() => new CmsApiClient(undefined, localStorage.getItem(TOKEN_KEY)));
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<{ email: string; displayName: string; roles: string[] } | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<FlashMessage | null>(null);

  const [loginEmail, setLoginEmail] = useState('owner@emcnotary.com');
  const [loginPassword, setLoginPassword] = useState('ChangeMe123!');

  const [contactForm, setContactForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    jobTitle: '',
  });

  const [selectedContactId, setSelectedContactId] = useState('');
  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === selectedContactId) ?? null,
    [contacts, selectedContactId]
  );

  const [callForm, setCallForm] = useState({
    fromNumber: '+15550000000',
    toNumber: '+15550000001',
  });

  const [emailForm, setEmailForm] = useState({
    from: 'CertifiedLSA@emcnotary.com',
    to: '',
    subject: 'Outreach Follow-up',
    body: 'Thank you for your time today. Sharing next steps for the notary support program.',
  });

  const [smsForm, setSmsForm] = useState({
    from: '+15550000000',
    to: '',
    body: 'Thanks for your time today. I will follow up shortly.',
  });

  useEffect(() => {
    api.setToken(token);
  }, [api, token]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setContacts([]);
      setFlags(null);
      return;
    }

    void refreshDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function refreshDashboard(): Promise<void> {
    setLoading(true);
    try {
      const [me, contactList, featureFlags] = await Promise.all([
        api.getMe(),
        api.getContacts(),
        api.getFeatureFlags(),
      ]);
      setUser(me);
      setContacts(contactList);
      setFlags(featureFlags);
      if (!selectedContactId && contactList.length > 0) {
        setSelectedContactId(contactList[0].id);
        setEmailForm((current) => ({ ...current, to: contactList[0].email ?? current.to }));
        setSmsForm((current) => ({ ...current, to: contactList[0].phone ?? current.to }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load dashboard';
      setFlash({ tone: 'error', text: message });
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setFlash(null);
    try {
      const session = await api.login(loginEmail, loginPassword);
      setToken(session.accessToken);
      localStorage.setItem(TOKEN_KEY, session.accessToken);
      setFlash({ tone: 'success', text: `Logged in as ${session.user.displayName}` });
    } catch (error) {
      setFlash({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Login failed',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateContact(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    try {
      await api.createContact({
        firstName: contactForm.firstName,
        lastName: contactForm.lastName,
        email: contactForm.email || undefined,
        phone: contactForm.phone || undefined,
        jobTitle: contactForm.jobTitle || undefined,
      });
      setContactForm({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '' });
      await refreshDashboard();
      setFlash({ tone: 'success', text: 'Contact created.' });
    } catch (error) {
      setFlash({ tone: 'error', text: error instanceof Error ? error.message : 'Create contact failed' });
    } finally {
      setLoading(false);
    }
  }

  async function handleCallStart(): Promise<void> {
    if (!selectedContactId) {
      setFlash({ tone: 'error', text: 'Select a contact first.' });
      return;
    }
    setLoading(true);
    try {
      const call = await api.startCall({
        contactId: selectedContactId,
        fromNumber: callForm.fromNumber,
        toNumber: callForm.toNumber,
      });
      setFlash({ tone: 'success', text: `Call started. Provider ref: ${call.providerCallId}` });
    } catch (error) {
      setFlash({ tone: 'error', text: error instanceof Error ? error.message : 'Call start failed' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmail(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    try {
      await api.sendEmail({
        from: emailForm.from,
        to: emailForm.to,
        subject: emailForm.subject,
        body: emailForm.body,
        contactId: selectedContactId || undefined,
      });
      setFlash({ tone: 'success', text: 'Email queued to worker.' });
    } catch (error) {
      setFlash({ tone: 'error', text: error instanceof Error ? error.message : 'Email send failed' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSendSms(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    try {
      await api.sendSms({
        from: smsForm.from,
        to: smsForm.to,
        body: smsForm.body,
        contactId: selectedContactId || undefined,
      });
      setFlash({ tone: 'success', text: 'SMS queued.' });
    } catch (error) {
      setFlash({ tone: 'info', text: error instanceof Error ? error.message : 'SMS blocked by policy' });
    } finally {
      setLoading(false);
    }
  }

  async function handleApproveCampaign(): Promise<void> {
    setLoading(true);
    try {
      await api.approveSmsCampaign('Campaign prepared for outreach. Awaiting provider compliance approval.');
      const featureFlags = await api.getFeatureFlags();
      setFlags(featureFlags);
      setFlash({ tone: 'success', text: 'Campaign approval marker recorded.' });
    } catch (error) {
      setFlash({ tone: 'error', text: error instanceof Error ? error.message : 'Approval failed' });
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleWebSoftphone(): Promise<void> {
    if (!flags) {
      return;
    }
    setLoading(true);
    try {
      const next = await api.patchFeatureFlags({
        webSoftphoneEnabled: !flags.webSoftphoneEnabled,
      });
      setFlags(next);
      setFlash({ tone: 'success', text: `Web softphone is now ${next.webSoftphoneEnabled ? 'enabled' : 'disabled'}.` });
    } catch (error) {
      setFlash({ tone: 'error', text: error instanceof Error ? error.message : 'Update failed' });
    } finally {
      setLoading(false);
    }
  }

  function handleLogout(): void {
    setToken(null);
    setUser(null);
    setContacts([]);
    setFlags(null);
    localStorage.removeItem(TOKEN_KEY);
  }

  if (!token) {
    return (
      <main className="shell shell--login">
        <section className="card login-card">
          <h1>EMC Outreach CMS</h1>
          <p>Call-centric CRM with AI summaries, email enabled, SMS policy-gated.</p>
          <form onSubmit={handleLogin} className="form-grid">
            <label>
              Email
              <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
            </label>
            <label>
              Password
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          {flash ? <Flash message={flash} /> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Outreach Operations Console</h1>
          <p>
            {user?.displayName} · {user?.email}
          </p>
        </div>
        <div className="topbar-actions">
          <button onClick={() => void refreshDashboard()} disabled={loading}>
            Refresh
          </button>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </header>

      {flash ? <Flash message={flash} /> : null}

      <section className="grid-3">
        <article className="card">
          <h2>Contacts</h2>
          <form onSubmit={handleCreateContact} className="form-grid compact">
            <input
              placeholder="First name"
              value={contactForm.firstName}
              onChange={(event) => setContactForm((current) => ({ ...current, firstName: event.target.value }))}
            />
            <input
              placeholder="Last name"
              value={contactForm.lastName}
              onChange={(event) => setContactForm((current) => ({ ...current, lastName: event.target.value }))}
            />
            <input
              placeholder="Email"
              value={contactForm.email}
              onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))}
            />
            <input
              placeholder="Phone"
              value={contactForm.phone}
              onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))}
            />
            <input
              placeholder="Title"
              value={contactForm.jobTitle}
              onChange={(event) => setContactForm((current) => ({ ...current, jobTitle: event.target.value }))}
            />
            <button type="submit" disabled={loading}>
              Add Contact
            </button>
          </form>

          <ul className="list">
            {contacts.map((contact) => (
              <li
                key={contact.id}
                className={contact.id === selectedContactId ? 'selected' : ''}
                onClick={() => {
                  setSelectedContactId(contact.id);
                  setEmailForm((current) => ({ ...current, to: contact.email ?? current.to }));
                  setSmsForm((current) => ({ ...current, to: contact.phone ?? current.to }));
                  setCallForm((current) => ({ ...current, toNumber: contact.phone ?? current.toNumber }));
                }}
              >
                <div>
                  <strong>
                    {contact.firstName} {contact.lastName}
                  </strong>
                  <p>{contact.jobTitle ?? 'No role set'}</p>
                </div>
                <span className={`stage stage--${contact.stageId}`}>{contact.stageId}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Calling</h2>
          <p>
            Android-first call flow. Web softphone is currently{' '}
            <strong>{flags?.webSoftphoneEnabled ? 'enabled' : 'disabled'}</strong>.
          </p>
          <label>
            Selected Contact
            <input value={selectedContact ? `${selectedContact.firstName} ${selectedContact.lastName}` : ''} readOnly />
          </label>
          <label>
            From Number
            <input
              value={callForm.fromNumber}
              onChange={(event) => setCallForm((current) => ({ ...current, fromNumber: event.target.value }))}
            />
          </label>
          <label>
            To Number
            <input
              value={callForm.toNumber}
              onChange={(event) => setCallForm((current) => ({ ...current, toNumber: event.target.value }))}
            />
          </label>
          <button onClick={() => void handleCallStart()} disabled={loading || !selectedContactId}>
            Start Outbound Call
          </button>
          <p className="hint">Consent prompt is always enabled before recording.</p>
        </article>

        <article className="card">
          <h2>Admin & Policy</h2>
          <dl className="flag-list">
            <div>
              <dt>Email</dt>
              <dd>{flags?.emailEnabled ? 'Enabled' : 'Disabled'}</dd>
            </div>
            <div>
              <dt>SMS</dt>
              <dd>{flags?.smsEnabled ? 'Enabled' : 'Disabled'}</dd>
            </div>
            <div>
              <dt>Campaign Approved</dt>
              <dd>{flags?.smsCampaignApproved ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt>Web Softphone</dt>
              <dd>{flags?.webSoftphoneEnabled ? 'Enabled' : 'Disabled'}</dd>
            </div>
          </dl>
          <button onClick={() => void handleApproveCampaign()} disabled={loading}>
            Record SMS Campaign Approval
          </button>
          <button onClick={() => void handleToggleWebSoftphone()} disabled={loading}>
            Toggle Web Softphone
          </button>
          <p className="hint">SMS delivery remains blocked unless both approval and SMS enablement are active.</p>
        </article>
      </section>

      <section className="grid-2">
        <article className="card">
          <h2>Email Outreach</h2>
          <form onSubmit={handleSendEmail} className="form-grid">
            <label>
              From
              <input
                value={emailForm.from}
                onChange={(event) => setEmailForm((current) => ({ ...current, from: event.target.value }))}
              />
            </label>
            <label>
              To
              <input
                value={emailForm.to}
                onChange={(event) => setEmailForm((current) => ({ ...current, to: event.target.value }))}
              />
            </label>
            <label>
              Subject
              <input
                value={emailForm.subject}
                onChange={(event) => setEmailForm((current) => ({ ...current, subject: event.target.value }))}
              />
            </label>
            <label>
              Body
              <textarea
                rows={5}
                value={emailForm.body}
                onChange={(event) => setEmailForm((current) => ({ ...current, body: event.target.value }))}
              />
            </label>
            <button type="submit" disabled={loading}>
              Queue Email
            </button>
          </form>
        </article>

        <article className="card">
          <h2>Text Outreach (Gated)</h2>
          <form onSubmit={handleSendSms} className="form-grid">
            <label>
              From
              <input
                value={smsForm.from}
                onChange={(event) => setSmsForm((current) => ({ ...current, from: event.target.value }))}
              />
            </label>
            <label>
              To
              <input
                value={smsForm.to}
                onChange={(event) => setSmsForm((current) => ({ ...current, to: event.target.value }))}
              />
            </label>
            <label>
              Body
              <textarea
                rows={5}
                value={smsForm.body}
                onChange={(event) => setSmsForm((current) => ({ ...current, body: event.target.value }))}
              />
            </label>
            <button type="submit" disabled={loading || !flags?.smsEnabled || !flags?.smsCampaignApproved}>
              Attempt SMS Send
            </button>
          </form>
          <p className="hint">Feature is built, but launch policy keeps SMS turned off until approved.</p>
        </article>
      </section>
    </main>
  );
}

function Flash({ message }: { message: FlashMessage }) {
  return <p className={`flash flash--${message.tone}`}>{message.text}</p>;
}
