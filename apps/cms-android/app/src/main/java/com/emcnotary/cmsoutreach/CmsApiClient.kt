package com.emcnotary.cmsoutreach

/**
 * Placeholder for Android API integration.
 * Future implementation should use Retrofit + OkHttp with token auth.
 */
class CmsApiClient(private val baseUrl: String) {
  suspend fun login(email: String, password: String): String {
    // TODO: call /auth/login and return access token
    return ""
  }

  suspend fun startCall(contactId: String, fromNumber: String, toNumber: String) {
    // TODO: call /calls/start after Twilio dial action is initiated
  }
}
