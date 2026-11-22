package com.cms.student.media

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

/**
 * ConnectivityManager-backed online probe (normal permission `ACCESS_NETWORK_STATE`,
 * declared in the manifest). A JVM fake replaces it in the unit tests.
 */
class ConnectivityNetworkAvailability(context: Context) : () -> Boolean {

    private val connectivityManager =
        context.applicationContext.getSystemService(ConnectivityManager::class.java)

    override fun invoke(): Boolean {
        val manager = connectivityManager ?: return false
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
