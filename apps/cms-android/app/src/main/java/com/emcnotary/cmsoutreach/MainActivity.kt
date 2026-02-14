package com.emcnotary.cmsoutreach

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    setContent {
      val status = remember { mutableStateOf("Android call client scaffold") }

      Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
      ) {
        Column(modifier = Modifier.padding(24.dp)) {
          Text("EMC Outreach Android", style = MaterialTheme.typography.headlineSmall)
          Text("Status: ${status.value}", modifier = Modifier.padding(top = 8.dp, bottom = 16.dp))
          Button(onClick = {
            status.value = "Dialer integration pending Twilio token service"
          }) {
            Text("Check Dialer Integration")
          }
        }
      }
    }
  }
}
