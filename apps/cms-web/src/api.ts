export interface ApiError extends Error {
  status?: number;
  code?: string;
}

export interface FeatureFlags {
  emailEnabled: boolean;
  smsEnabled: boolean;
  smsCampaignApproved: boolean;
  webSoftphoneEnabled: boolean;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  stageId: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
}

export interface Call {
  id: string;
  contactId: string;
  providerCallId?: string;
  status: string;
  fromNumber: string;
  toNumber: string;
  createdAt: string;
}

const DEFAULT_BASE_URL = import.meta.env.VITE_CMS_API_URL ?? 'http://localhost:4010';

export class CmsApiClient {
  private token: string | null;
  private readonly baseUrl: string;

  constructor(baseUrl = DEFAULT_BASE_URL, token: string | null = null) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  async login(email: string, password: string): Promise<{ accessToken: string; user: { email: string; displayName: string } }> {
    const payload = await this.request('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });

    return {
      accessToken: payload.tokens.accessToken,
      user: payload.user,
    };
  }

  async getMe(): Promise<{ email: string; displayName: string; roles: string[] }> {
    const payload = await this.request('/auth/me');
    return payload.user;
  }

  async getContacts(): Promise<Contact[]> {
    const payload = await this.request('/contacts');
    return payload.contacts;
  }

  async createContact(input: {
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    jobTitle?: string;
  }): Promise<Contact> {
    const payload = await this.request('/contacts', {
      method: 'POST',
      body: input,
    });
    return payload.contact;
  }

  async addContactNote(contactId: string, body: string): Promise<void> {
    await this.request(`/contacts/${contactId}/notes`, {
      method: 'POST',
      body: { body },
    });
  }

  async startCall(input: { contactId: string; fromNumber: string; toNumber: string }): Promise<Call> {
    const payload = await this.request('/calls/start', {
      method: 'POST',
      body: input,
    });
    return payload.call;
  }

  async sendEmail(input: { to: string; from: string; subject: string; body: string; contactId?: string }): Promise<{ id: string; status: string }> {
    const payload = await this.request('/messages/email/send', {
      method: 'POST',
      body: input,
    });
    return payload.message;
  }

  async sendSms(input: { to: string; from: string; body: string; contactId?: string }): Promise<{ id: string; status: string }> {
    const payload = await this.request('/messages/sms/send', {
      method: 'POST',
      body: input,
    });
    return payload.message;
  }

  async getFeatureFlags(): Promise<FeatureFlags> {
    const payload = await this.request('/admin/feature-flags');
    return payload.featureFlags;
  }

  async patchFeatureFlags(flags: Partial<FeatureFlags>): Promise<FeatureFlags> {
    const payload = await this.request('/admin/feature-flags', {
      method: 'PATCH',
      body: flags,
    });
    return payload.featureFlags;
  }

  async approveSmsCampaign(approvalNote: string): Promise<void> {
    await this.request('/admin/campaign-approval', {
      method: 'POST',
      body: { approvalNote },
    });
  }

  private async request(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PATCH';
      body?: Record<string, unknown>;
      auth?: boolean;
    } = {}
  ): Promise<any> {
    const auth = options.auth ?? true;
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(auth && this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message ?? response.statusText) as ApiError;
      error.status = response.status;
      error.code = payload?.error?.code;
      throw error;
    }
    return payload;
  }
}
