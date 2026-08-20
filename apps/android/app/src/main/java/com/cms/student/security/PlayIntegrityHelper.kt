package com.cms.student
enum class IntegrityCheckpoint { LOGIN, OFFLINE_DOWNLOAD, SENSITIVE_CONTENT, PERIODIC_REFRESH }
enum class IntegrityVerdict { NOT_CONFIGURED, ACCEPTED, REJECTED }
class PlayIntegrityHelper { fun evaluate(checkpoint: IntegrityCheckpoint, requestHash: String): IntegrityVerdict { require(requestHash.isNotBlank()) { "request hash is required" }; return IntegrityVerdict.NOT_CONFIGURED } }
