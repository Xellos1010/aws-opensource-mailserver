// DNS API utilities for Mail-in-a-Box
export type DnsApiConfig = {
  baseUrl: string;
  email: string;
  password: string;
};

export type DnsApiResponse = {
  httpCode: number;
  body: string;
};

