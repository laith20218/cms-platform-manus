# Phase 45 — External CI References

| المصدر | النتيجة المستخدمة |
|---|---|
| [GitHub Actions: Hardware accelerated Android virtualization](https://github.blog/changelog/2024-04-02-github-actions-hardware-accelerated-android-virtualization-now-available/) | يوضح أن GitHub-hosted Linux runners يمكنها تشغيل Android virtualization عند إتاحة KVM وإضافة rule لمجموعة KVM. |
| [ReactiveCircus/android-emulator-runner README](https://github.com/ReactiveCircus/android-emulator-runner) | يوثق أن action يثبت مكونات SDK، ينشئ AVD، يشغّل emulator، ينتظر boot، ثم ينفذ script مثل `./gradlew connectedCheck`؛ ويوثق inputs API/target/arch/KVM. |

هذه المصادر استُخدمت لتحضير `.github/workflows/android-offline-runtime.yml` فقط. لا تثبت أن workflow نُفّذ لهذا المشروع؛ runtime/CI evidence يتطلب run ID وartifacts من Git remote حقيقي.
